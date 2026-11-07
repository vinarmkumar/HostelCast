const crypto = require("node:crypto");
const express = require("express");
const { AccessToken, DataPacket_Kind, RoomServiceClient, TrackSource } = require("livekit-server-sdk");
const User = require("../SIGNIN_SIGNUP/Models/User");
const { requireUser } = require("./authMiddleware");
const { getCollegeFilter } = require("./liveCategories");
const {
  addLiveRoom,
  addLiveChatMessage,
  addLiveLike,
  consumeLiveChatAllowance,
  banLiveViewer,
  clearStageGuestByUser,
  clearStageInvite,
  endStageGuest,
  getLiveRoom,
  getLiveChatHistory,
  getLiveLikeStats,
  getLiveRooms,
  getHostRoomName,
  refreshLiveRoom,
  releaseHost,
  removeLiveRoom,
  reserveHost,
  resolveStageInvite,
  setStageInvite,
  setStageGuestFilter,
  setLiveFilter,
  setLivePreview,
} = require("./liveRegistry");

const router = express.Router();
const STAGE_INVITE_TTL_MS = 30_000;
const allowedCategories = new Set(["Engineering", "Medical", "FashionDesign", "Arts", "Other"]);
const viewerIdentityPattern = /^viewer-([a-f\d]{24})-([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/i;
const VIEWER_SNAPSHOT_TTL_MS = 5_000;
const MAX_VIEWER_SNAPSHOT_ROOMS = 2_000;
const viewerSnapshots = new Map();

function isConnectionRefused(error) {
  const pending = [error];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (current.code === "ECONNREFUSED") return true;
    if (current.cause) pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }
  return false;
}

function getLiveKitConfig() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  if (!/^wss?:\/\//i.test(LIVEKIT_URL)) throw new Error("LIVEKIT_URL must use ws:// or wss://.");

  const httpUrl = LIVEKIT_URL.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  return { url: LIVEKIT_URL, roomService: new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) };
}

async function addCurrentChatAvatars(messages, hostId) {
  const userIds = [...new Set(messages.map((message) => {
    if (String(message.identity || "").toLowerCase() === String(hostId || "").toLowerCase()) return hostId;
    return viewerIdentityPattern.exec(message.identity || "")?.[1] || null;
  }).filter(Boolean))];
  if (!userIds.length) return messages;
  const users = await User.find({ _id: { $in: userIds } }).select("avatarUrl").lean();
  const avatarsById = new Map(users.map((user) => [String(user._id).toLowerCase(), user.avatarUrl || ""]));
  return messages.map((message) => {
    const userId = String(message.identity || "").toLowerCase() === String(hostId || "").toLowerCase()
      ? String(hostId).toLowerCase()
      : (viewerIdentityPattern.exec(message.identity || "")?.[1] || "").toLowerCase();
    return { ...message, avatarUrl: avatarsById.get(userId) || "" };
  });
}

async function createToken(config, { identity, name, roomName, canPublish }) {
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: "1h",
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await token.toJwt(), url: config.url };
}

async function notifyRoomsChanged(req) {
  const io = req.app.get("io");
  if (!io) return;
  try {
    const rooms = await getLiveRooms({ includePreviews: false });
    io.liveRoomsSignature = JSON.stringify(rooms.map((room) => room.roomName).sort());
  } catch (error) {
    console.error("Could not update live-room event snapshot:", error.message);
  }
  io.emit("live:rooms:update");
}

function getViewerUserId(identity) {
  return viewerIdentityPattern.exec(identity || "")?.[1]?.toLowerCase() || null;
}

function getViewerSnapshot(roomService, roomName, forceRefresh = false) {
  const cached = viewerSnapshots.get(roomName);
  if (cached?.expiresAt === Number.POSITIVE_INFINITY) return cached.promise;
  if (forceRefresh && cached) viewerSnapshots.delete(roomName);
  else if (cached && cached.expiresAt > Date.now()) {
    viewerSnapshots.delete(roomName);
    viewerSnapshots.set(roomName, cached);
    return cached.promise;
  }

  const entry = { expiresAt: Number.POSITIVE_INFINITY, promise: null };
  entry.promise = roomService.listParticipants(roomName).then((participants) => {
    const viewerUserIds = new Set();
    const viewerIdentities = new Set();
    participants.forEach((participant) => {
      const userId = getViewerUserId(participant.identity);
      if (!userId) return;
      viewerUserIds.add(userId);
      viewerIdentities.add(participant.identity);
    });
    entry.expiresAt = Date.now() + VIEWER_SNAPSHOT_TTL_MS;
    return { viewerUserIds, viewerIdentities };
  }).catch((error) => {
    if (viewerSnapshots.get(roomName) === entry) viewerSnapshots.delete(roomName);
    throw error;
  });
  viewerSnapshots.set(roomName, entry);
  while (viewerSnapshots.size > MAX_VIEWER_SNAPSHOT_ROOMS) {
    viewerSnapshots.delete(viewerSnapshots.keys().next().value);
  }
  return entry.promise;
}

async function sendStageSignal(config, roomName, signal, destinationIdentities) {
  await config.roomService.sendData(
    roomName,
    Buffer.from(JSON.stringify(signal)),
    DataPacket_Kind.RELIABLE,
    { topic: "hostelcast-stage", destinationIdentities }
  );
}

async function getHostLiveRoom(roomName, userId) {
  const room = await getLiveRoom(roomName);
  if (!room) return { error: { status: 404, message: "This live cast has ended." } };
  if (room.hostId !== userId) return { error: { status: 403, message: "Only the host can manage this live cast." } };
  return { room };
}

function toPublicLiveRoom(room) {
  const { blockedUserIds: _blockedUserIds, pendingStageInvite: _pendingStageInvite, ...publicRoom } = room;
  publicRoom.stageGuest = room.stageGuest
    ? {
      identity: room.stageGuest.identity,
      name: room.stageGuest.name,
      activeFilter: room.stageGuest.activeFilter || "natural",
    }
    : null;
  return publicRoom;
}

router.get("/rooms", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const rooms = await getLiveRooms();
    const hostIds = [...new Set(rooms.map((room) => room.hostId).filter(Boolean))];
    const [hosts, config] = await Promise.all([
      hostIds.length
        ? User.find({ _id: { $in: hostIds } }).select("_id gender").lean()
        : [],
      Promise.resolve(getLiveKitConfig()),
    ]);
    const hostGenders = new Map(hosts.map((host) => [String(host._id), host.gender]));
    const roomsWithAudience = await Promise.all(rooms.map(async (room) => {
      const hostGender = hostGenders.get(String(room.hostId));
      let viewerCount = null;
      if (config) {
        try {
          const participants = await getViewerSnapshot(config.roomService, room.roomName);
          viewerCount = participants.viewerIdentities.size
            - Number(participants.viewerIdentities.has(room.stageGuest?.identity));
        } catch (error) {
          console.error(`Live audience count could not be loaded (${room.roomName}):`, error.message);
        }
      }
      return {
        ...room,
        ...(hostGender ? { hostGender } : {}),
        viewerCount,
      };
    }));
    return res.json({ success: true, rooms: roomsWithAudience });
  } catch (error) {
    console.error("Live rooms could not be loaded:", error.message);
    return res.status(503).json({ success: false, message: "Live casts are temporarily unavailable." });
  }
});

router.post("/start", requireUser, async (req, res) => {
  let roomName;
  let hostReserved = false;
  let roomCreated = false;
  let roomRegistered = false;
  let failureMessage = "Could not start your live cast. Please try again.";
  try {
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured yet." });

    const title = String(req.body?.title || "").trim().slice(0, 80);
    const category = String(req.body?.category || "");
    if (title.length < 3 || !allowedCategories.has(category)) {
      return res.status(400).json({ success: false, message: "Enter a live title and select a valid category." });
    }

    const user = await User.findById(req.authUserId).select("name college category");
    if (!user) return res.status(401).json({ success: false, message: "User account was not found." });

    roomName = `hc-${user.id}-${crypto.randomUUID()}`;
    const reservation = await reserveHost(user.id, roomName);
    if (reservation !== "OK") return res.status(409).json({ success: false, message: "You already have a live cast running." });
    hostReserved = true;

    const maxParticipants = Math.max(2, Math.min(Number(process.env.LIVE_MAX_PARTICIPANTS) || 10000, 10000));
    await config.roomService.createRoom({ name: roomName, emptyTimeout: 60, departureTimeout: 30, maxParticipants });
    roomCreated = true;

    const room = {
      roomName,
      title,
      category,
      college: user.college || "Campus",
      collegeFilter: getCollegeFilter(category, user.college || ""),
      host: user.name,
      hostId: user.id,
      activeFilter: "balanced-exposure",
      pendingStageInvite: null,
      stageGuest: null,
      blockedUserIds: [],
      views: 0,
      startedAt: new Date().toISOString(),
    };
    await addLiveRoom(room);
    roomRegistered = true;
    const hostToken = await createToken(config, { identity: user.id, name: user.name, roomName, canPublish: true });
    await notifyRoomsChanged(req);
    return res.status(201).json({ success: true, room, ...hostToken });
  } catch (error) {
    if (isConnectionRefused(error)) {
      console.error("LiveKit server is unreachable. Start it or configure LIVEKIT_URL with a reachable ws:// or wss:// endpoint.");
      failureMessage = "Live streaming is unavailable. Please ask the administrator to check the LiveKit service.";
    } else {
      console.error("Live cast could not start:", error);
    }
    if (roomRegistered && roomName) {
      try {
        await removeLiveRoom(roomName, req.authUserId);
      } catch (cleanupError) {
        console.error("Live registry cleanup failed:", cleanupError.message);
      }
    }
    if (roomCreated && roomName) {
      try {
        const config = getLiveKitConfig();
        await config?.roomService.deleteRoom(roomName);
      } catch (cleanupError) {
        console.error("LiveKit room cleanup failed:", cleanupError.message);
      }
    }
    if (hostReserved && roomName) {
      try {
        await releaseHost(req.authUserId, roomName);
      } catch (cleanupError) {
        console.error("Live host reservation cleanup failed:", cleanupError.message);
      }
    }
    return res.status(503).json({ success: false, message: failureMessage });
  }
});

router.post("/host/active/rejoin", requireUser, async (req, res) => {
  try {
    const userId = String(req.authUserId).toLowerCase();
    const requestedRoomName = String(req.body?.roomName || "");
    const activeRoomName = await getHostRoomName(userId);
    if (!activeRoomName || activeRoomName !== requestedRoomName) {
      return res.json({ success: true, active: false });
    }

    const room = await getLiveRoom(activeRoomName);
    if (!room) {
      await removeLiveRoom(activeRoomName, userId);
      await notifyRoomsChanged(req);
      return res.json({ success: true, active: false });
    }
    if (String(room.hostId).toLowerCase() !== userId) {
      return res.status(403).json({ success: false, message: "Only the host can resume this live cast." });
    }

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    if (!await refreshLiveRoom(activeRoomName, userId)) {
      return res.status(404).json({ success: false, message: "This live cast has expired." });
    }

    const user = await User.findById(userId).select("name");
    if (!user) return res.status(401).json({ success: false, message: "User account was not found." });
    const hostToken = await createToken(config, {
      identity: user.id,
      name: user.name,
      roomName: activeRoomName,
      canPublish: true,
    });
    const chatHistory = await getLiveChatHistory(activeRoomName);
    return res.json({
      success: true,
      active: true,
      room: toPublicLiveRoom(room),
      chatHistory,
      ...hostToken,
    });
  } catch (error) {
    console.error("Active live cast could not be resumed:", error);
    return res.status(503).json({ success: false, message: "Could not resume your live cast." });
  }
});

router.get("/:roomName/stats", requireUser, async (req, res) => {
  try {
    const roomName = String(req.params.roomName || "");
    const room = await getLiveRoom(roomName);
    if (!room) return res.status(404).json({ success: false, message: "This live cast has ended." });
    const userId = String(req.authUserId).toLowerCase();
    if ((room.blockedUserIds || []).includes(userId)) {
      return res.status(403).json({ success: false, message: "The host has blocked you from this live cast." });
    }

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    let participants = await getViewerSnapshot(config.roomService, roomName);
    const isHost = String(room.hostId).toLowerCase() === userId;
    let isConnectedViewer = participants.viewerUserIds.has(userId);
    if (!isHost && !isConnectedViewer) {
      participants = await getViewerSnapshot(config.roomService, roomName, true);
      isConnectedViewer = participants.viewerUserIds.has(userId);
    }
    if (!isHost && !isConnectedViewer) {
      return res.status(403).json({ success: false, message: "Join this live cast to view its audience stats." });
    }
    const viewers = participants.viewerIdentities.size
      - Number(participants.viewerIdentities.has(room.stageGuest?.identity));
    const likes = await getLiveLikeStats(roomName, userId);
    return res.json({ success: true, viewers, likes: likes.count, liked: likes.liked });
  } catch (error) {
    console.error("Live audience stats could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Live audience stats are temporarily unavailable." });
  }
});

router.post("/:roomName/like", requireUser, async (req, res) => {
  try {
    const roomName = String(req.params.roomName || "");
    const userId = String(req.authUserId).toLowerCase();
    const room = await getLiveRoom(roomName);
    if (!room) return res.status(404).json({ success: false, message: "This live cast has ended." });
    if (String(room.hostId).toLowerCase() === userId) {
      return res.status(403).json({ success: false, message: "The host cannot like their own live cast." });
    }
    if ((room.blockedUserIds || []).includes(userId)) {
      return res.status(403).json({ success: false, message: "The host has blocked you from this live cast." });
    }

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    let participants = await getViewerSnapshot(config.roomService, roomName);
    let isConnectedViewer = participants.viewerUserIds.has(userId);
    if (!isConnectedViewer) {
      participants = await getViewerSnapshot(config.roomService, roomName, true);
      isConnectedViewer = participants.viewerUserIds.has(userId);
    }
    if (!isConnectedViewer) {
      return res.status(403).json({ success: false, message: "Join this live cast before liking it." });
    }

    const likes = await addLiveLike(roomName, userId);
    return res.json({ success: true, likes, liked: true });
  } catch (error) {
    console.error("Live cast could not be liked:", error);
    return res.status(503).json({ success: false, message: "Could not like this live cast." });
  }
});

router.post("/:roomName/token", requireUser, async (req, res) => {
  try {
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured yet." });
    const roomName = String(req.params.roomName || "");
    if (!/^hc-[a-f\d]{24}-[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(roomName)) {
      return res.status(400).json({ success: false, message: "Invalid live room." });
    }

    const room = await getLiveRoom(roomName);
    if (!room) return res.status(404).json({ success: false, message: "This live cast has ended." });
    if (room.hostId === req.authUserId) {
      return res.status(403).json({ success: false, message: "Use the broadcaster session to rejoin your live cast." });
    }
    if ((room.blockedUserIds || []).includes(String(req.authUserId).toLowerCase())) {
      return res.status(403).json({ success: false, message: "The host has blocked you from this live cast." });
    }

    const user = await User.findById(req.authUserId).select("name");
    if (!user) return res.status(401).json({ success: false, message: "User account was not found." });
    const viewerIdentity = `viewer-${user.id}-${crypto.randomUUID()}`;
    const viewerToken = await createToken(config, {
      identity: viewerIdentity,
      name: user.name,
      roomName,
      canPublish: false,
    });
    const chatHistory = await addCurrentChatAvatars(await getLiveChatHistory(roomName), room.hostId);
    return res.json({ success: true, room: toPublicLiveRoom(room), chatHistory, ...viewerToken });
  } catch (error) {
    console.error("Viewer access could not be created:", error);
    return res.status(503).json({ success: false, message: "Could not join this live cast." });
  }
});

router.get("/:roomName/chat", requireUser, async (req, res) => {
  try {
    const room = await getLiveRoom(req.params.roomName);
    if (!room) return res.status(404).json({ success: false, message: "This live cast has ended." });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const history = await addCurrentChatAvatars(await getLiveChatHistory(req.params.roomName), room.hostId);
    return res.json({ success: true, messages: history });
  } catch (error) {
    console.error("Live chat history could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Live chat history is temporarily unavailable." });
  }
});

router.post("/:roomName/chat", requireUser, async (req, res) => {
  try {
    const roomName = String(req.params.roomName || "");
    const room = await getLiveRoom(roomName);
    if (!room) return res.status(404).json({ success: false, message: "This live cast has ended." });
    const identity = String(req.body?.identity || "");
    const message = String(req.body?.message || "").trim().slice(0, 300);
    if (!message) return res.status(400).json({ success: false, message: "Write a comment before sending." });

    const userId = String(req.authUserId).toLowerCase();
    const isHost = String(room.hostId).toLowerCase() === userId && identity === room.hostId;
    const viewerUserId = getViewerUserId(identity);
    if (!isHost && viewerUserId !== userId) {
      return res.status(403).json({ success: false, message: "You cannot send a comment as another participant." });
    }
    if ((room.blockedUserIds || []).includes(userId)) {
      return res.status(403).json({ success: false, message: "The host has blocked you from this live cast." });
    }

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const allowance = await consumeLiveChatAllowance(roomName, userId);
    if (!allowance.allowed) {
      res.set("Retry-After", String(allowance.retryAfter));
      return res.status(429).json({ success: false, message: "Please wait a moment before sending another comment." });
    }
    const participant = await config.roomService.getParticipant(roomName, identity);
    const user = await User.findById(userId).select("college avatarUrl");
    const chatMessage = {
      id: crypto.randomUUID(),
      identity,
      name: String(participant.name || "Student").slice(0, 60),
      university: String(isHost ? room.college || "" : user?.college || "").trim().slice(0, 80),
      avatarUrl: user?.avatarUrl || "",
      message,
      role: isHost ? "host" : "viewer",
      timestamp: new Date().toISOString(),
    };
    await addLiveChatMessage(roomName, chatMessage);
    await config.roomService.sendData(
      roomName,
      Buffer.from(JSON.stringify({ type: "chat", ...chatMessage })),
      DataPacket_Kind.RELIABLE,
      { topic: "hostelcast-chat" }
    );
    return res.json({ success: true, message: chatMessage });
  } catch (error) {
    console.error("Live comment could not be sent:", error);
    return res.status(503).json({ success: false, message: "Could not send your comment." });
  }
});

router.post("/stage/:roomName/invite", requireUser, async (req, res) => {
  try {
    const { room, error } = await getHostLiveRoom(req.params.roomName, req.authUserId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    if (room.stageGuest) return res.status(409).json({ success: false, message: "A viewer is already on stage." });

    const identity = String(req.body?.identity || "");
    const targetUserId = getViewerUserId(identity);
    if (!targetUserId || targetUserId === String(req.authUserId).toLowerCase()) {
      return res.status(400).json({ success: false, message: "Select a valid viewer to invite." });
    }
    if ((room.blockedUserIds || []).includes(targetUserId)) {
      return res.status(403).json({ success: false, message: "This viewer is blocked from the live cast." });
    }

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const participant = await config.roomService.getParticipant(req.params.roomName, identity);
    const invite = {
      identity,
      userId: targetUserId,
      name: participant.name || "Viewer",
      expiresAt: Date.now() + STAGE_INVITE_TTL_MS,
    };
    if (!await setStageInvite(req.params.roomName, req.authUserId, invite)) {
      return res.status(409).json({ success: false, message: "Another stage invite is already pending." });
    }
    try {
      await sendStageSignal(config, req.params.roomName, {
        type: "stage-invite",
        name: invite.name,
        expiresAt: invite.expiresAt,
      }, [identity]);
    } catch (sendError) {
      await clearStageInvite(req.params.roomName, req.authUserId, identity);
      throw sendError;
    }
    return res.json({ success: true, invite });
  } catch (error) {
    console.error("Stage invite could not be sent:", error);
    return res.status(503).json({ success: false, message: "Could not invite this viewer to the stage." });
  }
});

router.post("/stage/:roomName/respond", requireUser, async (req, res) => {
  try {
    const room = await getLiveRoom(req.params.roomName);
    if (!room) return res.status(404).json({ success: false, message: "This live cast has ended." });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const identity = String(req.body?.identity || "");
    const accepted = req.body?.accepted === true;
    const resolution = await resolveStageInvite(req.params.roomName, req.authUserId, identity, accepted);
    if (resolution.status === "EXPIRED") {
      await sendStageSignal(config, req.params.roomName, {
        type: "stage-invite-expired",
        identity,
        name: resolution.invite.name,
      }, [room.hostId]);
      return res.status(410).json({ success: false, message: "The 30-second stage invitation has expired." });
    }
    if (resolution.status === "NOT_INVITED") {
      return res.status(403).json({ success: false, message: "This stage invitation is no longer active." });
    }
    if (resolution.status !== "OK") {
      return res.status(409).json({ success: false, message: "The live stage is no longer available." });
    }

    if (accepted) {
      try {
        await config.roomService.updateParticipant(req.params.roomName, identity, {
          permission: {
            canSubscribe: true,
            canPublish: true,
            canPublishData: true,
            canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
          },
        });
      } catch (permissionError) {
        await endStageGuest(req.params.roomName, room.hostId, identity);
        throw permissionError;
      }
    }
    await sendStageSignal(config, req.params.roomName, {
      type: accepted ? "stage-guest-started" : "stage-invite-declined",
      identity,
      name: resolution.invite.name,
      activeFilter: accepted ? resolution.room.stageGuest?.activeFilter || "natural" : undefined,
    }, accepted ? undefined : [room.hostId]);
    return res.json({ success: true, stageGuest: accepted ? resolution.invite : null });
  } catch (error) {
    console.error("Stage invitation response failed:", error);
    return res.status(503).json({ success: false, message: "Could not respond to the stage invitation." });
  }
});

router.post("/stage/:roomName/leave", requireUser, async (req, res) => {
  try {
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const identity = String(req.body?.identity || "");
    const room = await getLiveRoom(req.params.roomName);
    const guest = room?.stageGuest;
    if (!guest || guest.userId !== req.authUserId || guest.identity !== identity) {
      return res.status(403).json({ success: false, message: "You are not currently on stage." });
    }

    await config.roomService.updateParticipant(req.params.roomName, identity, {
      permission: { canSubscribe: true, canPublish: false, canPublishData: true },
    });
    await clearStageGuestByUser(req.params.roomName, req.authUserId, identity);
    await sendStageSignal(config, req.params.roomName, {
      type: "stage-guest-ended",
      identity,
      name: guest.name,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("Guest could not leave the live stage:", error);
    return res.status(503).json({ success: false, message: "Could not leave the live stage." });
  }
});

router.post("/stage/:roomName/filter", requireUser, async (req, res) => {
  try {
    const identity = String(req.body?.identity || "");
    const filterId = String(req.body?.filterId || "");
    const updated = await setStageGuestFilter(req.params.roomName, req.authUserId, identity, filterId);
    if (!updated) {
      return res.status(403).json({ success: false, message: "Only the current stage guest can change this filter." });
    }
    return res.json({ success: true, filterId });
  } catch (error) {
    console.error("Stage guest filter could not be saved:", error);
    return res.status(503).json({ success: false, message: "Could not update the stage filter." });
  }
});

router.post("/stage/:roomName/end", requireUser, async (req, res) => {
  try {
    const { room, error } = await getHostLiveRoom(req.params.roomName, req.authUserId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const guest = room.stageGuest;
    if (!guest) return res.status(404).json({ success: false, message: "There is no guest on stage." });
    const participants = await config.roomService.listParticipants(req.params.roomName);
    if (participants.some((participant) => participant.identity === guest.identity)) {
      await config.roomService.updateParticipant(req.params.roomName, guest.identity, {
        permission: { canSubscribe: true, canPublish: false, canPublishData: true },
      });
    }
    const ended = await endStageGuest(req.params.roomName, req.authUserId, guest.identity);
    if (!ended) return res.status(409).json({ success: false, message: "The stage guest has already left." });
    await sendStageSignal(config, req.params.roomName, {
      type: "stage-guest-ended",
      identity: guest.identity,
      name: guest.name,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("Host could not end the guest stage:", error);
    return res.status(503).json({ success: false, message: "Could not end the guest's stage." });
  }
});

router.post("/stage/:roomName/disconnected", requireUser, async (req, res) => {
  try {
    const { room, error } = await getHostLiveRoom(req.params.roomName, req.authUserId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    const identity = String(req.body?.identity || "");
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    if (room.stageGuest?.identity === identity) {
      const ended = await endStageGuest(req.params.roomName, req.authUserId, identity);
      if (!ended) return res.json({ success: true, alreadyEnded: true });
      await sendStageSignal(config, req.params.roomName, {
        type: "stage-guest-ended",
        identity,
        name: room.stageGuest.name,
      });
      return res.json({ success: true });
    }
    if (room.pendingStageInvite?.identity === identity) {
      const cleared = await clearStageInvite(req.params.roomName, req.authUserId, identity);
      if (!cleared) return res.json({ success: true, alreadyEnded: true });
      await sendStageSignal(config, req.params.roomName, {
        type: "stage-invite-expired",
        identity,
        name: room.pendingStageInvite.name,
      });
      return res.json({ success: true });
    }
    return res.json({ success: true, alreadyEnded: true });
  } catch (error) {
    console.error("Disconnected stage guest could not be cleared:", error);
    return res.status(503).json({ success: false, message: "Could not clear the disconnected stage guest." });
  }
});

router.post("/stage/:roomName/ban", requireUser, async (req, res) => {
  try {
    const { room, error } = await getHostLiveRoom(req.params.roomName, req.authUserId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    const identity = String(req.body?.identity || "");
    const targetUserId = getViewerUserId(identity);
    if (!targetUserId || targetUserId === String(req.authUserId).toLowerCase()) {
      return res.status(400).json({ success: false, message: "Select a valid viewer to block." });
    }
    const updatedRoom = await banLiveViewer(req.params.roomName, req.authUserId, targetUserId);
    if (!updatedRoom) return res.status(404).json({ success: false, message: "This live cast has ended." });

    if (room.pendingStageInvite?.identity === identity) {
      await sendStageSignal(config, req.params.roomName, {
        type: "stage-invite-cancelled",
        identity,
      }, [identity]);
    }
    const participants = await config.roomService.listParticipants(req.params.roomName);
    if (participants.some((participant) => participant.identity === identity)) {
      await config.roomService.removeParticipant(req.params.roomName, identity, {
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
      });
    }
    if (room.stageGuest?.identity === identity) {
      await sendStageSignal(config, req.params.roomName, {
        type: "stage-guest-ended",
        identity,
        name: room.stageGuest.name,
      });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Viewer could not be blocked from live cast:", error);
    return res.status(503).json({ success: false, message: "Could not block this viewer." });
  }
});

router.post("/:roomName/preview", requireUser, async (req, res) => {
  try {
    const saved = await setLivePreview(req.params.roomName, req.authUserId, req.body?.preview);
    if (!saved) return res.status(400).json({ success: false, message: "Live preview could not be saved." });
    req.app.get("io")?.emit("live:rooms:update");
    return res.json({ success: true });
  } catch (error) {
    console.error("Live preview could not be saved:", error.message);
    return res.status(503).json({ success: false, message: "Live preview could not be saved." });
  }
});

router.post("/:roomName/filter", requireUser, async (req, res) => {
  try {
    const filterId = String(req.body?.filterId || "");
    const updated = await setLiveFilter(req.params.roomName, req.authUserId, filterId);
    if (!updated) return res.status(400).json({ success: false, message: "Live video filter could not be updated." });
    return res.json({ success: true });
  } catch (error) {
    console.error("Live video filter could not be updated:", error.message);
    return res.status(503).json({ success: false, message: "Live video filter could not be updated." });
  }
});

router.post("/:roomName/heartbeat", requireUser, async (req, res) => {
  try {
    const refreshed = await refreshLiveRoom(req.params.roomName, req.authUserId);
    if (!refreshed) return res.status(404).json({ success: false, message: "Live cast not found." });
    return res.json({ success: true });
  } catch (error) {
    console.error("Live cast heartbeat failed:", error.message);
    return res.status(503).json({ success: false, message: "Live cast connection could not be refreshed." });
  }
});

router.delete("/host/active", requireUser, async (req, res) => {
  try {
    const roomName = await getHostRoomName(req.authUserId);
    if (!roomName) return res.json({ success: true, alreadyStopped: true });

    const room = await getLiveRoom(roomName);
    if (room && room.hostId !== req.authUserId) {
      return res.status(403).json({ success: false, message: "Only the host can end this live cast." });
    }

    if (room) {
      const config = getLiveKitConfig();
      if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
      await config.roomService.deleteRoom(roomName);
    }

    await removeLiveRoom(roomName, req.authUserId);
    await notifyRoomsChanged(req);
    return res.json({ success: true });
  } catch (error) {
    console.error("Existing live cast could not be ended:", error);
    return res.status(503).json({ success: false, message: "Could not end the existing live cast." });
  }
});

router.delete("/:roomName", requireUser, async (req, res) => {
  try {
    const room = await getLiveRoom(req.params.roomName);
    if (!room) {
      await removeLiveRoom(req.params.roomName, req.authUserId);
      return res.json({ success: true, alreadyStopped: true });
    }
    if (room.hostId !== req.authUserId) return res.status(403).json({ success: false, message: "Only the host can end this live cast." });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: "Live streaming is not configured." });
    await config.roomService.deleteRoom(req.params.roomName);
    const removed = await removeLiveRoom(req.params.roomName, req.authUserId);
    if (removed === false) return res.status(403).json({ success: false, message: "Only the host can end this live cast." });
    await notifyRoomsChanged(req);
    return res.json({ success: true, alreadyStopped: !removed });
  } catch (error) {
    console.error("Live cast could not be stopped:", error);
    return res.status(503).json({ success: false, message: "Could not stop your live cast." });
  }
});

module.exports = router;
