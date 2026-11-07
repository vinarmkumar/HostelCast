const { getRedisClient } = require("../SIGNIN_SIGNUP/redis");

const LIVE_ROOM_SET = "live:rooms";
const LIVE_ROOM_TTL_SECONDS = 90;
const STAGE_INVITE_TTL_MS = 30_000;
const MAX_PREVIEW_LENGTH = 80_000;
const ROOM_READ_BATCH_SIZE = 50;
const LIVE_FILTERS = new Set([
  "natural",
  "balanced-exposure",
  "soft",
  "glow",
  "bright-beauty",
  "soft-glam",
  "rosy",
  "warm",
  "cool",
  "vivid",
  "vintage",
  "mono",
]);

function previewKey(roomName) {
  return `live:preview:${roomName}`;
}

function chatHistoryKey(roomName) {
  return `live:chat:${roomName}`;
}

function likesKey(roomName) {
  return `live:likes:${roomName}`;
}

async function getRequiredRedis() {
  const client = await getRedisClient();
  if (!client) throw new Error("Live services need an active Redis connection.");
  return client;
}

async function reserveHost(userId, roomName) {
  const client = await getRequiredRedis();
  return client.set(`live:host:${userId}`, roomName, { NX: true, EX: LIVE_ROOM_TTL_SECONDS });
}

async function getHostRoomName(userId) {
  const client = await getRequiredRedis();
  return client.get(`live:host:${userId}`);
}

async function releaseHost(userId, roomName) {
  const client = await getRequiredRedis();
  const key = `live:host:${userId}`;
  if (await client.get(key) === roomName) await client.del(key);
}

async function addLiveRoom(room) {
  const client = await getRequiredRedis();
  await client.set(`live:room:${room.roomName}`, JSON.stringify(room), { EX: LIVE_ROOM_TTL_SECONDS });
  await client.sAdd(LIVE_ROOM_SET, room.roomName);
}

async function getLiveRoom(roomName) {
  const client = await getRequiredRedis();
  const serializedRoom = await client.get(`live:room:${roomName}`);
  return serializedRoom ? JSON.parse(serializedRoom) : null;
}

async function refreshLiveRoom(roomName, userId) {
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) return false;
  const room = JSON.parse(serializedRoom);
  if (room.hostId !== userId) return false;

  await Promise.all([
    client.expire(key, LIVE_ROOM_TTL_SECONDS),
    client.expire(`live:host:${userId}`, LIVE_ROOM_TTL_SECONDS),
    client.expire(previewKey(roomName), LIVE_ROOM_TTL_SECONDS),
    client.expire(chatHistoryKey(roomName), LIVE_ROOM_TTL_SECONDS),
    client.expire(likesKey(roomName), LIVE_ROOM_TTL_SECONDS),
  ]);
  return true;
}

async function addLiveChatMessage(roomName, message) {
  const client = await getRequiredRedis();
  const key = chatHistoryKey(roomName);
  await client.rPush(key, JSON.stringify(message));
  await client.lTrim(key, -100, -1);
  await client.expire(key, LIVE_ROOM_TTL_SECONDS);
}

async function consumeLiveChatAllowance(roomName, userId) {
  const client = await getRequiredRedis();
  const cooldownKey = `live:chat:cooldown:${userId}`;
  if (await client.set(cooldownKey, "1", { NX: true, EX: 1 }) !== "OK") {
    return { allowed: false, retryAfter: 1 };
  }

  const minuteKey = `live:chat:rate:${roomName}:${userId}`;
  const count = await client.incr(minuteKey);
  if (count === 1) await client.expire(minuteKey, 60);
  if (count <= 30) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.max(1, await client.ttl(minuteKey)) };
}

async function getLiveChatHistory(roomName) {
  const client = await getRequiredRedis();
  const entries = await client.lRange(chatHistoryKey(roomName), -100, -1);
  return entries.map((entry) => JSON.parse(entry));
}

async function addLiveLike(roomName, userId) {
  const client = await getRequiredRedis();
  const key = likesKey(roomName);
  await client.sAdd(key, userId);
  await client.expire(key, LIVE_ROOM_TTL_SECONDS);
  return client.sCard(key);
}

async function getLiveLikeStats(roomName, userId) {
  const client = await getRequiredRedis();
  const key = likesKey(roomName);
  const [count, liked] = await Promise.all([
    client.sCard(key),
    client.sIsMember(key, userId),
  ]);
  return { count, liked: Boolean(liked) };
}

async function setLivePreview(roomName, userId, preview) {
  const client = await getRequiredRedis();
  const room = await getLiveRoom(roomName);
  if (!room || room.hostId !== userId) return false;
  if (typeof preview !== "string" || !preview.startsWith("data:image/jpeg;base64,") || preview.length > MAX_PREVIEW_LENGTH) {
    return false;
  }
  await client.set(previewKey(roomName), preview, { EX: LIVE_ROOM_TTL_SECONDS });
  return true;
}

async function setLiveFilter(roomName, userId, filterId) {
  if (!LIVE_FILTERS.has(filterId)) return false;
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) return false;
  const room = JSON.parse(serializedRoom);
  if (room.hostId !== userId) return false;
  await client.set(key, JSON.stringify({ ...room, activeFilter: filterId }), { EX: LIVE_ROOM_TTL_SECONDS });
  return true;
}

async function setStageGuestFilter(roomName, userId, identity, filterId) {
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) return false;
  const room = JSON.parse(serializedRoom);
  const guest = room.stageGuest;
  if (
    !guest
    || guest.userId !== String(userId).toLowerCase()
    || guest.identity !== identity
    || !LIVE_FILTERS.has(filterId)
  ) return false;

  await client.set(key, JSON.stringify({
    ...room,
    stageGuest: { ...guest, activeFilter: filterId },
  }), { EX: LIVE_ROOM_TTL_SECONDS });
  return true;
}

async function updateLiveRoom(roomName, hostId, update) {
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) return null;
  const room = JSON.parse(serializedRoom);
  if (room.hostId !== hostId) return null;
  const updatedRoom = update(room);
  await client.set(key, JSON.stringify(updatedRoom), { EX: LIVE_ROOM_TTL_SECONDS });
  return updatedRoom;
}

async function setStageInvite(roomName, hostId, invite) {
  let created = false;
  await updateLiveRoom(roomName, hostId, (current) => {
    const inviteIsPending = current.pendingStageInvite
      && current.pendingStageInvite.expiresAt > Date.now();
    if (current.stageGuest || inviteIsPending) return current;
    created = true;
    return {
      ...current,
      pendingStageInvite: {
        ...invite,
        expiresAt: invite.expiresAt || Date.now() + STAGE_INVITE_TTL_MS,
      },
    };
  });
  return created;
}

async function clearStageInvite(roomName, hostId, identity) {
  let cleared = false;
  await updateLiveRoom(roomName, hostId, (current) => {
    if (current.pendingStageInvite?.identity !== identity) return current;
    cleared = true;
    return { ...current, pendingStageInvite: null };
  });
  return cleared;
}

async function resolveStageInvite(roomName, userId, identity, accepted) {
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) return { status: "NOT_FOUND" };
  const room = JSON.parse(serializedRoom);
  const invite = room.pendingStageInvite;
  if (!invite || invite.userId !== String(userId).toLowerCase() || invite.identity !== identity) return { status: "NOT_INVITED" };
  if (!Number.isFinite(invite.expiresAt) || invite.expiresAt <= Date.now()) {
    await client.set(key, JSON.stringify({ ...room, pendingStageInvite: null }), { EX: LIVE_ROOM_TTL_SECONDS });
    return { status: "EXPIRED", invite };
  }
  if (accepted && room.stageGuest) return { status: "STAGE_BUSY" };
  const updatedRoom = {
    ...room,
    pendingStageInvite: null,
    stageGuest: accepted ? { ...invite, activeFilter: "natural" } : null,
  };
  await client.set(key, JSON.stringify(updatedRoom), { EX: LIVE_ROOM_TTL_SECONDS });
  return { status: "OK", room: updatedRoom, invite };
}

async function endStageGuest(roomName, hostId, identity) {
  let ended = false;
  await updateLiveRoom(roomName, hostId, (current) => {
    if (!current.stageGuest || current.stageGuest.identity !== identity) return current;
    ended = true;
    return { ...current, stageGuest: null };
  });
  return ended;
}

async function clearStageGuestByUser(roomName, userId, identity) {
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) return null;
  const room = JSON.parse(serializedRoom);
  if (room.stageGuest?.userId !== String(userId).toLowerCase() || room.stageGuest.identity !== identity) return null;
  await client.set(key, JSON.stringify({ ...room, stageGuest: null }), { EX: LIVE_ROOM_TTL_SECONDS });
  return room.stageGuest;
}

async function banLiveViewer(roomName, hostId, userId) {
  return updateLiveRoom(roomName, hostId, (room) => ({
    ...room,
    blockedUserIds: [...new Set([...(room.blockedUserIds || []), userId])],
    pendingStageInvite: room.pendingStageInvite?.userId === userId ? null : room.pendingStageInvite,
    stageGuest: room.stageGuest?.userId === userId ? null : room.stageGuest,
  }));
}

async function removeLiveRoom(roomName, userId) {
  const client = await getRequiredRedis();
  const key = `live:room:${roomName}`;
  const serializedRoom = await client.get(key);
  if (!serializedRoom) {
    await Promise.all([
      client.del(previewKey(roomName)),
      client.del(chatHistoryKey(roomName)),
      client.del(likesKey(roomName)),
      client.sRem(LIVE_ROOM_SET, roomName),
      releaseHost(userId, roomName),
    ]);
    return null;
  }

  const room = JSON.parse(serializedRoom);
  if (room.hostId !== userId) return false;
  await Promise.all([
    client.del(key),
    client.del(previewKey(roomName)),
    client.del(chatHistoryKey(roomName)),
    client.del(likesKey(roomName)),
    client.sRem(LIVE_ROOM_SET, roomName),
    releaseHost(userId, roomName),
  ]);
  return room;
}

async function getLiveRooms({ includePreviews = true } = {}) {
  const client = await getRequiredRedis();
  const roomNames = await client.sMembers(LIVE_ROOM_SET);
  const rooms = [];
  const expiredRoomNames = [];

  for (let offset = 0; offset < roomNames.length; offset += ROOM_READ_BATCH_SIZE) {
    const batch = roomNames.slice(offset, offset + ROOM_READ_BATCH_SIZE);
    const roomValues = await Promise.all(batch.map((roomName) => client.get(`live:room:${roomName}`)));
    const previewValues = includePreviews
      ? await Promise.all(batch.map((roomName) => client.get(previewKey(roomName))))
      : batch.map(() => null);

    batch.forEach((roomName, index) => {
      if (!roomValues[index]) {
        expiredRoomNames.push(roomName);
        return;
      }

      let room;
      try {
        room = JSON.parse(roomValues[index]);
      } catch (error) {
        console.error(`Invalid live room data was removed from Redis (${roomName}):`, error.message);
        expiredRoomNames.push(roomName);
        return;
      }

      const {
        blockedUserIds: _blockedUserIds,
        pendingStageInvite: _pendingStageInvite,
        ...publicRoom
      } = room;
      publicRoom.stageGuest = room.stageGuest
        ? {
          identity: room.stageGuest.identity,
          name: room.stageGuest.name,
          activeFilter: room.stageGuest.activeFilter || "natural",
        }
        : null;
      rooms.push(includePreviews && previewValues[index]
        ? { ...publicRoom, preview: previewValues[index] }
        : publicRoom);
    });
  }

  if (expiredRoomNames.length) await client.sRem(LIVE_ROOM_SET, expiredRoomNames);
  return rooms;
}

module.exports = {
  LIVE_ROOM_TTL_SECONDS,
  reserveHost,
  getHostRoomName,
  releaseHost,
  addLiveRoom,
  getLiveRoom,
  refreshLiveRoom,
  addLiveChatMessage,
  consumeLiveChatAllowance,
  getLiveChatHistory,
  addLiveLike,
  getLiveLikeStats,
  setLivePreview,
  setLiveFilter,
  setStageGuestFilter,
  setStageInvite,
  clearStageInvite,
  resolveStageInvite,
  endStageGuest,
  clearStageGuestByUser,
  banLiveViewer,
  removeLiveRoom,
  getLiveRooms,
};
