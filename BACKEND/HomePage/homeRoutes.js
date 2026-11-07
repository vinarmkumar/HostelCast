const express = require("express");
const User = require("../SIGNIN_SIGNUP/Models/User");
const { getLiveRooms } = require("../Live/liveRegistry");
const { getCachedValue, setCachedValue } = require("../SIGNIN_SIGNUP/redis");

const router = express.Router();

router.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 60);
    if (query.length < 2) return res.json({ success: true, users: [] });
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const [users, rooms] = await Promise.all([
      User.find({
        $or: [
          { name: { $regex: escapedQuery, $options: "i" } },
          { college: { $regex: escapedQuery, $options: "i" } },
        ],
      }).select("name college avatarUrl").limit(8).lean(),
      getLiveRooms({ includePreviews: false }),
    ]);
    const liveRoomsByUser = new Map();
    rooms.forEach((room) => {
      liveRoomsByUser.set(String(room.hostId), room);
      const stageGuestUserId = /^viewer-([a-f\d]{24})-/i.exec(room.stageGuest?.identity || "")?.[1];
      if (stageGuestUserId) liveRoomsByUser.set(stageGuestUserId.toLowerCase(), room);
    });
    const results = users.map((user) => {
      const liveRoom = liveRoomsByUser.get(String(user._id).toLowerCase());
      return {
        id: String(user._id),
        name: user.name,
        college: user.college || "",
        avatarUrl: user.avatarUrl || "",
        liveRoom: liveRoom ? {
          roomName: liveRoom.roomName,
          title: liveRoom.title,
          category: liveRoom.category,
          college: liveRoom.college,
          collegeFilter: liveRoom.collegeFilter,
          host: liveRoom.host,
          hostId: liveRoom.hostId,
          views: liveRoom.views,
          preview: liveRoom.preview,
          stageGuest: liveRoom.stageGuest,
        } : null,
      };
    });
    return res.json({ success: true, users: results });
  } catch (error) {
    console.error("User search failed:", error);
    return res.status(503).json({ success: false, message: "Student search is temporarily unavailable." });
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const rooms = await getLiveRooms();
    const filteredRooms = rooms
      .filter((room) => !req.query.category || room.category === req.query.category)
      .filter((room) => !req.query.college || req.query.college === "All" || (room.collegeFilter || room.college) === req.query.college)
      .sort(req.query.sort === "college" ? (a, b) => a.college.localeCompare(b.college) : (a, b) => b.views - a.views);
    return res.json({ success: true, rooms: filteredRooms });
  } catch (error) {
    console.error("Home live rooms could not be loaded:", error.message);
    return res.status(503).json({ success: false, message: "Live casts are temporarily unavailable." });
  }
});

router.get("/me/:id", async (req, res) => {
  try {
    const cacheKey = `home:profile:${req.params.id}`;
    const cachedProfile = await getCachedValue(cacheKey);
    if (cachedProfile) {
      try {
        return res.json({ success: true, user: JSON.parse(cachedProfile), cached: true });
      } catch (error) {
        console.error("Invalid cached profile data:", error.message);
      }
    }

    const user = await User.findById(req.params.id).select("name email college gender");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const profile = { id: user._id, name: user.name, email: user.email, college: user.college, gender: user.gender };
    await setCachedValue(cacheKey, JSON.stringify(profile), 300);
    return res.json({ success: true, user: profile });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ success: false, message: "Invalid user id." });
    console.error("Profile lookup failed:", error);
    return res.status(500).json({ success: false, message: "Profile could not be loaded." });
  }
});

module.exports = router;
