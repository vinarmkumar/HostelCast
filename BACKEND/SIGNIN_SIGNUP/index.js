// Backend ki secret values ko BACKEND/.env se process.env mein load kiya jaata hai.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const { createServer } = require("node:http");
const connectDatabase = require("./database");
const authRoutes = require("./Routes/authRoutes");
const homeRoutes = require("../HomePage/homeRoutes");
const profileRoutes = require("../MyProfile/profileRoutes");
const liveRoutes = require("../Live/liveRoutes");
const { createLiveSockets, monitorLiveRooms } = require("../Live/liveSockets");
const { getRedisClient, closeRedis } = require("./redis");

const app = express(); // Express ka application server object yahan banega.
app.use(cors({ origin: true, credentials: true })); // Frontend dev server ko backend API call karne ki permission milti hai.
app.use(express.json({ limit: "100kb" })); // Auth JSON plus live preview snapshots yahan parse hote hain.
app.get("/api/health", async (_req, res) => {
  const redis = await getRedisClient();
  return res.json({ status: "ok", redis: Boolean(redis?.isReady) });
});
app.use("/api/auth", authRoutes); // Auth route file ke saare signup/signin endpoints yahan mounted hain.
app.use("/api/home", homeRoutes); // Top-level HomePage folder ke live feed aur profile APIs yahan mounted hain.
app.use("/api/profiles", profileRoutes);
app.use("/api/live", liveRoutes);

async function startServer() {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /replace-with|change-this/i.test(process.env.JWT_SECRET)) {
      throw new Error("JWT_SECRET must be configured in .env with a random value of at least 32 characters.");
    }
    await connectDatabase(); // Database connected hone ke baad hi Express server start hota hai.
    const server = createServer(app);
    const io = await createLiveSockets(server);
    app.set("io", io);
    monitorLiveRooms(io);
    const port = process.env.PORT || 5000;
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} pehle se use ho raha hai. Extra backend band karke sirf ek 'npm run dev' chalao.`);
        process.exit(1);
      }
      console.error("Server start nahi hua:", error.message);
      process.exit(1);
    });
    server.listen(port, () => console.log(`HostelCast backend port ${port} par chal raha hai.`));
  } catch (error) {
    console.error("Server start nahi hua:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", async () => {
  await closeRedis();
  process.exit(0);
});
