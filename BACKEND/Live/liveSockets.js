const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { getRedisClient } = require("../SIGNIN_SIGNUP/redis");
const { corsOrigin } = require("../SIGNIN_SIGNUP/corsConfig");
const { getLiveRooms } = require("./liveRegistry");

async function createLiveSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });
  const redis = await getRedisClient();
  if (!redis) {
    console.error("Live updates are running without a Redis Socket.IO adapter.");
    return io;
  }

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  pubClient.on("error", (error) => console.error("Live socket Redis publisher error:", error.message));
  subClient.on("error", (error) => console.error("Live socket Redis subscriber error:", error.message));

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Live Socket.IO Redis adapter connected.");
  } catch (error) {
    console.error("Live Socket.IO Redis adapter unavailable:", error.message);
    await Promise.allSettled([
      pubClient.isOpen ? pubClient.quit() : Promise.resolve(),
      subClient.isOpen ? subClient.quit() : Promise.resolve(),
    ]);
  }
  return io;
}

function monitorLiveRooms(io) {
  const timer = setInterval(async () => {
    try {
      const currentRooms = (await getLiveRooms({ includePreviews: false })).map((room) => room.roomName).sort();
      const currentSignature = JSON.stringify(currentRooms);
      if (io.liveRoomsSignature !== undefined && currentSignature !== io.liveRoomsSignature) {
        io.emit("live:rooms:update");
      }
      io.liveRoomsSignature = currentSignature;
    } catch (error) {
      console.error("Live room monitor could not refresh:", error.message);
    }
  }, 30_000);
  timer.unref();
}

module.exports = { createLiveSockets, monitorLiveRooms };
