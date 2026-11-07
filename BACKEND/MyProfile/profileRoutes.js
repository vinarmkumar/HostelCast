const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Readable } = require("node:stream");
const User = require("../SIGNIN_SIGNUP/Models/User");
const ProfilePost = require("./models/ProfilePost");
const UserFollow = require("./models/UserFollow");
const HookupRequest = require("./models/HookupRequest");
const { requireUser } = require("../Live/authMiddleware");
const { getLiveRooms } = require("../Live/liveRegistry");

const router = express.Router();
const MAX_PROFILE_PHOTOS = 10;
const MAX_PROFILE_VIDEOS = 1;
const MAX_PROFILE_PHOTO_BYTES = 50 * 1024 * 1024;
const MAX_PROFILE_VIDEO_BYTES = 200 * 1024 * 1024;

function createMemoryUpload(acceptFile, maxFileBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileBytes },
    fileFilter: (_req, file, callback) => {
      if (!acceptFile(file)) {
        callback(new Error("Choose a supported image or video file."));
        return;
      }
      callback(null, true);
    },
  });
}

const avatarUpload = createMemoryUpload(
  (file) => ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.mimetype),
  5 * 1024 * 1024
);
const postUpload = createMemoryUpload(
  (file) => file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/"),
  MAX_PROFILE_VIDEO_BYTES
);

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return false;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  return true;
}

function uploadToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const isVideo = file.mimetype.startsWith("video/");
    const options = { folder, resource_type: isVideo ? "video" : "image" };
    if (folder.endsWith("/avatars")) options.transformation = [{ width: 800, height: 800, crop: "limit" }];
    const completeUpload = (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };
    if (isVideo) {
      const uploadStream = cloudinary.uploader.upload_chunked_stream(
        completeUpload,
        { ...options, chunk_size: 20 * 1024 * 1024 }
      );
      Readable.from([file.buffer]).pipe(uploadStream);
      return;
    }
    const uploadStream = cloudinary.uploader.upload_stream(options, completeUpload);
    uploadStream.end(file.buffer);
  });
}

function deleteCloudinaryAsset(publicId, resourceType = "image") {
  if (!publicId || !configureCloudinary()) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

function uploadMiddleware(upload, field) {
  return (req, res, next) => upload.single(field)(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? "Photos can be up to 50 MB and videos can be up to 200 MB."
      : error.message || "The selected file could not be uploaded.";
    return res.status(400).json({ success: false, message });
  });
}

function findUserLiveRoom(rooms, userId) {
  const normalizedId = String(userId).toLowerCase();
  return rooms.find((room) => String(room.hostId).toLowerCase() === normalizedId
    || room.stageGuest?.userId === normalizedId
    || new RegExp(`^viewer-${normalizedId}-`, "i").test(room.stageGuest?.identity || "")) || null;
}

function normalizeHookupText(value) {
  return String(value || "").trim();
}

function getRequestUserId(req) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload?.id || null;
  } catch {
    return null;
  }
}

function hasHookupContact(user) {
  return Boolean(user?.hookupInstagram || user?.hookupWhatsApp || user?.hookupSnapchat);
}

router.get("/hookup-requests/:requestId", requireUser, async (req, res) => {
  try {
    const request = await HookupRequest.findById(req.params.requestId)
      .populate({ path: "senderId", select: "name avatarUrl hookupInstagram hookupWhatsApp hookupSnapchat" })
      .populate({ path: "recipientId", select: "name avatarUrl hookupInstagram hookupWhatsApp hookupSnapchat" })
      .lean();
    if (!request) return res.status(404).json({ success: false, message: "Hookup request not found." });
    if (String(request.recipientId?._id || request.recipientId) !== String(req.authUserId)) {
      return res.status(403).json({ success: false, message: "You can only manage your own hookup requests." });
    }
    return res.json({
      success: true,
      request: {
        id: String(request._id),
        senderId: String(request.senderId?._id || request.senderId),
        recipientId: String(request.recipientId?._id || request.recipientId),
        status: request.status,
        message: request.message || "",
        createdAt: request.createdAt,
        sender: {
          id: String(request.senderId?._id || request.senderId),
          name: request.senderId?.name || "",
          avatarUrl: request.senderId?.avatarUrl || "",
          instagram: request.status === "accepted" ? request.senderId?.hookupInstagram || "" : "",
          whatsapp: request.status === "accepted" ? request.senderId?.hookupWhatsApp || "" : "",
          snapchat: request.status === "accepted" ? request.senderId?.hookupSnapchat || "" : "",
        },
      },
    });
  } catch (error) {
    console.error("Hookup request could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Hookup request details are temporarily unavailable." });
  }
});

router.get("/:userId/hookup-requests", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only view your own hookup requests." });
    }
    const requests = await HookupRequest.find({ recipientId: req.authUserId })
      .sort({ createdAt: -1 })
      .populate({ path: "senderId", select: "name avatarUrl hookupInstagram hookupWhatsApp hookupSnapchat" })
      .lean();
    return res.json({
      success: true,
      requests: requests.map((request) => ({
        id: String(request._id),
        status: request.status,
        message: request.message || "",
        createdAt: request.createdAt,
        sender: {
          id: String(request.senderId?._id || request.senderId),
          name: request.senderId?.name || "",
          avatarUrl: request.senderId?.avatarUrl || "",
          instagram: request.status === "accepted" ? request.senderId?.hookupInstagram || "" : "",
          whatsapp: request.status === "accepted" ? request.senderId?.hookupWhatsApp || "" : "",
          snapchat: request.status === "accepted" ? request.senderId?.hookupSnapchat || "" : "",
        },
      })),
    });
  } catch (error) {
    console.error("Hookup requests could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Hookup requests are temporarily unavailable." });
  }
});

router.get("/:userId/hookup-sent-requests", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only view your own sent hookup requests." });
    }
    const requests = await HookupRequest.find({ senderId: req.authUserId })
      .sort({ createdAt: -1 })
      .populate({ path: "recipientId", select: "name avatarUrl hookupInstagram hookupWhatsApp hookupSnapchat" })
      .lean();
    return res.json({
      success: true,
      requests: requests.map((request) => ({
        id: String(request._id),
        status: request.status,
        message: request.message || "",
        createdAt: request.createdAt,
        recipient: {
          id: String(request.recipientId?._id || request.recipientId),
          name: request.recipientId?.name || "",
          avatarUrl: request.recipientId?.avatarUrl || "",
          instagram: request.status === "accepted" ? request.recipientId?.hookupInstagram || "" : "",
          whatsapp: request.status === "accepted" ? request.recipientId?.hookupWhatsApp || "" : "",
          snapchat: request.status === "accepted" ? request.recipientId?.hookupSnapchat || "" : "",
        },
      })),
    });
  } catch (error) {
    console.error("Sent hookup requests could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Sent hookup requests are temporarily unavailable." });
  }
});

router.get("/:userId/hookup", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    const [targetUser, senderUser, requests] = await Promise.all([
      User.findById(req.params.userId).select("hookupEnabled hookupInstagram hookupWhatsApp hookupSnapchat").lean(),
      User.findById(req.authUserId).select("hookupEnabled hookupInstagram hookupWhatsApp hookupSnapchat").lean(),
      HookupRequest.find({
        $or: [
          { senderId: req.authUserId, recipientId: req.params.userId },
          { senderId: req.params.userId, recipientId: req.authUserId },
        ],
      }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!targetUser) return res.status(404).json({ success: false, message: "Profile not found." });

    const request = requests.find((entry) => entry.status === "accepted") || requests[0] || null;
    const isSender = String(req.authUserId) === String(req.params.userId);
    const senderCanSend = Boolean(
      !isSender
      && senderUser?.hookupEnabled
      && hasHookupContact(senderUser)
      && targetUser?.hookupEnabled
      && hasHookupContact(targetUser)
    );
    const currentStatus = request ? request.status : "none";

    const shareContacts = request && request.status === "accepted";
    return res.json({
      success: true,
      hookup: {
        enabled: Boolean(targetUser.hookupEnabled),
        hasContactInfo: hasHookupContact(targetUser),
        canSend: senderCanSend && !request,
        status: currentStatus,
        requestId: request ? String(request._id) : null,
        instagram: shareContacts ? targetUser.hookupInstagram || "" : "",
        whatsapp: shareContacts ? targetUser.hookupWhatsApp || "" : "",
        snapchat: shareContacts ? targetUser.hookupSnapchat || "" : "",
      },
    });
  } catch (error) {
    console.error("Hookup status could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Hookup status is temporarily unavailable." });
  }
});

router.put("/:userId/hookup-settings", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only edit your own hookup settings." });
    }

    const enabled = Boolean(req.body?.enabled);
    const instagram = normalizeHookupText(req.body?.instagram).replace(/^@/, "");
    const whatsapp = normalizeHookupText(req.body?.whatsapp).replace(/\s+/g, "");
    const snapchat = normalizeHookupText(req.body?.snapchat).replace(/^@/, "");
    const hasContactInfo = Boolean(instagram || whatsapp || snapchat);
    if (enabled && !hasContactInfo) {
      return res.status(400).json({ success: false, message: "Turn on hookup only after adding at least one contact: Instagram, WhatsApp, or Snapchat." });
    }

    const user = await User.findByIdAndUpdate(
      req.authUserId,
      {
        $set: {
          hookupEnabled: enabled,
          hookupInstagram: instagram,
          hookupWhatsApp: whatsapp,
          hookupSnapchat: snapchat,
        },
      },
      { new: true, runValidators: true, projection: "hookupEnabled hookupInstagram hookupWhatsApp hookupSnapchat" }
    );

    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });

    return res.json({
      success: true,
      hookup: {
        enabled: Boolean(user.hookupEnabled),
        instagram: user.hookupInstagram || "",
        whatsapp: user.hookupWhatsApp || "",
        snapchat: user.hookupSnapchat || "",
        hasContactInfo: hasHookupContact(user),
      },
    });
  } catch (error) {
    console.error("Hookup settings could not be updated:", error);
    return res.status(503).json({ success: false, message: "Hookup settings could not be updated." });
  }
});

router.post("/:userId/hookup-request", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    if (String(req.authUserId) === String(req.params.userId)) {
      return res.status(400).json({ success: false, message: "You cannot send a hookup request to your own profile." });
    }

    const senderUser = await User.findById(req.authUserId).select("hookupEnabled hookupInstagram hookupWhatsApp hookupSnapchat").lean();
    const recipientUser = await User.findById(req.params.userId).select("hookupEnabled hookupInstagram hookupWhatsApp hookupSnapchat").lean();
    if (!recipientUser) return res.status(404).json({ success: false, message: "Profile not found." });
    if (!recipientUser.hookupEnabled || !hasHookupContact(recipientUser)) {
      return res.status(400).json({ success: false, message: "This profile is not accepting hookup requests right now." });
    }
    if (!senderUser?.hookupEnabled || !hasHookupContact(senderUser)) {
      return res.status(400).json({ success: false, message: "Turn on hookup and add at least one contact before sending a request." });
    }

    const message = normalizeHookupText(req.body?.message || "");
    const words = message.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
    if (words.length > 60) {
      return res.status(400).json({ success: false, message: "Hookup message cannot exceed 60 words." });
    }

    const existingRequest = await HookupRequest.findOne({ senderId: req.authUserId, recipientId: req.params.userId }).lean();
    if (existingRequest) {
      return res.status(409).json({
        success: false,
        message: existingRequest.status === "pending"
          ? "You already sent a hookup request to this profile."
          : `This profile already marked your request as ${existingRequest.status}.`,
      });
    }

    const request = await HookupRequest.create({
      senderId: req.authUserId,
      recipientId: req.params.userId,
      message,
      status: "pending",
    });

    return res.json({
      success: true,
      request: {
        id: String(request._id),
        status: request.status,
        message: request.message || "",
      },
    });
  } catch (error) {
    console.error("Hookup request could not be sent:", error);
    return res.status(503).json({ success: false, message: "Hookup request could not be sent." });
  }
});

router.patch("/hookup-requests/:requestId", requireUser, async (req, res) => {
  try {
    const request = await HookupRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: "Hookup request not found." });
    if (String(request.recipientId) !== String(req.authUserId)) {
      return res.status(403).json({ success: false, message: "You can only respond to requests sent to you." });
    }
    const status = String(req.body?.status || "").toLowerCase();
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Choose accepted or rejected." });
    }

    request.status = status;
    await request.save();

    const senderUser = await User.findById(request.senderId).select("name avatarUrl hookupInstagram hookupWhatsApp hookupSnapchat").lean();
    return res.json({
      success: true,
      request: {
        id: String(request._id),
        status: request.status,
        sender: {
          id: String(senderUser?._id || request.senderId),
          name: senderUser?.name || "",
          avatarUrl: senderUser?.avatarUrl || "",
          instagram: status === "accepted" ? senderUser?.hookupInstagram || "" : "",
          whatsapp: status === "accepted" ? senderUser?.hookupWhatsApp || "" : "",
          snapchat: status === "accepted" ? senderUser?.hookupSnapchat || "" : "",
        },
      },
    });
  } catch (error) {
    console.error("Hookup request decision could not be saved:", error);
    return res.status(503).json({ success: false, message: "Hookup request could not be updated." });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    const [user, posts, postsCount, photosCount, videosCount, followers, following, rooms] = await Promise.all([
      User.findById(req.params.userId).select("name college category avatarUrl bio hookupEnabled hookupInstagram hookupWhatsApp hookupSnapchat liveSchedule").lean(),
      ProfilePost.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(100).lean(),
      ProfilePost.countDocuments({ userId: req.params.userId }),
      ProfilePost.countDocuments({ userId: req.params.userId, mediaType: "image" }),
      ProfilePost.countDocuments({ userId: req.params.userId, mediaType: "video" }),
      UserFollow.countDocuments({ followingId: req.params.userId }),
      UserFollow.countDocuments({ followerId: req.params.userId }),
      getLiveRooms({ includePreviews: false }),
    ]);
    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });
    const liveRoom = findUserLiveRoom(rooms, req.params.userId);
    const authUserId = getRequestUserId(req) || req.authUserId || null;
    const isOwnProfile = Boolean(authUserId && String(authUserId) === String(req.params.userId));
    return res.json({
      success: true,
      profile: {
        id: String(user._id),
        name: user.name,
        college: user.college || "",
        category: user.category || "",
        avatarUrl: user.avatarUrl || "",
        bio: user.bio || "",
        hookup: {
          enabled: Boolean(user.hookupEnabled),
          instagram: isOwnProfile ? user.hookupInstagram || "" : "",
          whatsapp: isOwnProfile ? user.hookupWhatsApp || "" : "",
          snapchat: isOwnProfile ? user.hookupSnapchat || "" : "",
          hasContactInfo: isOwnProfile ? hasHookupContact(user) : false,
        },
        liveSchedule: user.liveSchedule || null,
        isOnline: Boolean(liveRoom),
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
        counts: { posts: postsCount, photos: photosCount, videos: videosCount, followers, following },
        posts: posts.map((post) => ({
          id: String(post._id),
          mediaUrl: post.mediaUrl,
          mediaType: post.mediaType,
          caption: post.caption,
          createdAt: post.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Profile could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Profile is temporarily unavailable." });
  }
});

router.get("/:userId/follow-status", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    const following = String(req.authUserId) !== String(req.params.userId)
      && Boolean(await UserFollow.exists({ followerId: req.authUserId, followingId: req.params.userId }));
    return res.json({ success: true, following });
  } catch (error) {
    console.error("Profile follow status could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Follow status is temporarily unavailable." });
  }
});

router.get("/:userId/following", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only view your own following list." });
    }
    const followedUsers = await UserFollow.find({ followerId: req.authUserId })
      .sort({ createdAt: -1 })
      .select("followingId")
      .lean();
    const users = await User.find({ _id: { $in: followedUsers.map((follow) => follow.followingId) } })
      .select("name college avatarUrl")
      .lean();
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    return res.json({
      success: true,
      users: followedUsers.flatMap(({ followingId }) => {
        const user = usersById.get(String(followingId));
        return user ? [{
          id: String(user._id),
          name: user.name,
          college: user.college || "",
          avatarUrl: user.avatarUrl || "",
        }] : [];
      }),
    });
  } catch (error) {
    console.error("Profile following list could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Following list is temporarily unavailable." });
  }
});

router.get("/:userId/followers", async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    const followerRecords = await UserFollow.find({ followingId: req.params.userId })
      .sort({ createdAt: -1 })
      .select("followerId")
      .lean();
    const users = await User.find({ _id: { $in: followerRecords.map((follow) => follow.followerId) } })
      .select("name college avatarUrl")
      .lean();
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    return res.json({
      success: true,
      users: followerRecords.flatMap(({ followerId }) => {
        const user = usersById.get(String(followerId));
        return user ? [{
          id: String(user._id),
          name: user.name,
          college: user.college || "",
          avatarUrl: user.avatarUrl || "",
        }] : [];
      }),
    });
  } catch (error) {
    console.error("Profile followers could not be loaded:", error);
    return res.status(503).json({ success: false, message: "Followers list is temporarily unavailable." });
  }
});

router.put("/:userId", requireUser, async (req, res) => {
  try {
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only edit your own profile." });
    }
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "bio")) {
      const bio = String(req.body.bio || "").trim();
      const wordCount = bio.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
      if (wordCount > 80) {
        return res.status(400).json({ success: false, message: "Bio cannot exceed 80 words." });
      }
      updates.bio = bio;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "liveSchedule")) {
      if (req.body.liveSchedule === null) {
        updates.liveSchedule = null;
      } else {
        const schedule = req.body.liveSchedule;
        const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
          return res.status(400).json({ success: false, message: "Invalid live schedule." });
        }
        const days = [...new Set(Array.isArray(schedule.days) ? schedule.days : [])];
        const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
        const timezone = String(schedule.timezone || "").trim();
        if (
          days.length === 0
          || days.some((day) => !validDays.includes(day))
          || !timePattern.test(schedule.startTime)
          || !timePattern.test(schedule.endTime)
          || !timezone
          || timezone.length > 64
        ) {
          return res.status(400).json({ success: false, message: "Choose valid days, times, and a time zone." });
        }
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone });
        } catch {
          return res.status(400).json({ success: false, message: "Choose a valid time zone." });
        }
        updates.liveSchedule = {
          days,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          timezone,
        };
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No profile changes were provided." });
    }
    const user = await User.findByIdAndUpdate(
      req.authUserId,
      { $set: updates },
      { new: true, runValidators: true, projection: "bio liveSchedule" }
    );
    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });
    return res.json({
      success: true,
      bio: user.bio || "",
      liveSchedule: user.liveSchedule || null,
    });
  } catch (error) {
    console.error("Profile could not be updated:", error);
    return res.status(503).json({ success: false, message: "Profile could not be updated." });
  }
});

router.post("/:userId/follow", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    if (String(req.authUserId) === String(req.params.userId)) {
      return res.status(400).json({ success: false, message: "You cannot follow your own profile." });
    }
    if (!await User.exists({ _id: req.params.userId })) {
      return res.status(404).json({ success: false, message: "Profile not found." });
    }
    await UserFollow.updateOne(
      { followerId: req.authUserId, followingId: req.params.userId },
      { $setOnInsert: { followerId: req.authUserId, followingId: req.params.userId } },
      { upsert: true }
    );
    const followers = await UserFollow.countDocuments({ followingId: req.params.userId });
    return res.json({ success: true, following: true, followers });
  } catch (error) {
    console.error("Profile could not be followed:", error);
    return res.status(503).json({ success: false, message: "Could not follow this profile." });
  }
});

router.delete("/:userId/follow", requireUser, async (req, res) => {
  try {
    if (!validId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid profile." });
    await UserFollow.deleteOne({ followerId: req.authUserId, followingId: req.params.userId });
    const followers = await UserFollow.countDocuments({ followingId: req.params.userId });
    return res.json({ success: true, following: false, followers });
  } catch (error) {
    console.error("Profile follow could not be removed:", error);
    return res.status(503).json({ success: false, message: "Could not update this follow." });
  }
});

router.post("/:userId/avatar", requireUser, uploadMiddleware(avatarUpload, "avatar"), async (req, res) => {
  let uploadedAvatar = null;
  let avatarSaved = false;
  try {
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only change your own profile photo." });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "Choose a profile photo to upload." });
    if (!configureCloudinary()) {
      return res.status(503).json({ success: false, message: "Add Cloudinary credentials to BACKEND/.env to enable profile uploads." });
    }
    const user = await User.findById(req.authUserId).select("avatarPublicId avatarCleanupPublicIds");
    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });
    uploadedAvatar = await uploadToCloudinary(req.file, "hostelcast/avatars");
    const oldPublicId = user.avatarPublicId;
    user.avatarUrl = uploadedAvatar.secure_url;
    user.avatarPublicId = uploadedAvatar.public_id;
    user.avatarCleanupPublicIds = [...new Set([
      ...(user.avatarCleanupPublicIds || []),
      oldPublicId,
    ].filter((publicId) => publicId && publicId !== uploadedAvatar.public_id))];
    await user.save();
    avatarSaved = true;

    for (const publicId of user.avatarCleanupPublicIds) {
      try {
        const deletion = await deleteCloudinaryAsset(publicId);
        if (!["ok", "not found"].includes(deletion?.result)) {
          throw new Error(`Cloudinary did not confirm deletion (${deletion?.result || "unknown result"}).`);
        }
        const pendingPublicIds = user.avatarCleanupPublicIds;
        user.avatarCleanupPublicIds = user.avatarCleanupPublicIds.filter((pendingId) => pendingId !== publicId);
        try {
          await user.save();
        } catch (saveError) {
          user.avatarCleanupPublicIds = pendingPublicIds;
          throw saveError;
        }
      } catch (cleanupError) {
        console.error("Old profile photo cleanup is pending:", cleanupError.message);
        break;
      }
    }
    return res.json({
      success: true,
      avatarUrl: user.avatarUrl,
      cleanupPending: user.avatarCleanupPublicIds.length > 0,
    });
  } catch (error) {
    if (uploadedAvatar && !avatarSaved) {
      try {
        await deleteCloudinaryAsset(uploadedAvatar.public_id);
      } catch (cleanupError) {
        console.error("Uncommitted profile photo could not be removed:", cleanupError.message);
      }
    }
    console.error("Profile photo upload failed:", error);
    return res.status(503).json({ success: false, message: "Profile photo upload failed." });
  }
});

router.post("/:userId/posts", requireUser, uploadMiddleware(postUpload, "media"), async (req, res) => {
  try {
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only post to your own profile." });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "Choose an image or video to post." });
    const isVideo = req.file.mimetype.startsWith("video/");
    if (!isVideo && req.file.size > MAX_PROFILE_PHOTO_BYTES) {
      return res.status(400).json({ success: false, message: "Photos can be up to 50 MB each." });
    }
    if (isVideo && req.file.size > MAX_PROFILE_VIDEO_BYTES) {
      return res.status(400).json({ success: false, message: "Videos can be up to 200 MB." });
    }
    const mediaType = isVideo ? "video" : "image";
    const mediaCount = await ProfilePost.countDocuments({ userId: req.authUserId, mediaType });
    const mediaLimit = isVideo ? MAX_PROFILE_VIDEOS : MAX_PROFILE_PHOTOS;
    if (mediaCount >= mediaLimit) {
      const message = isVideo
        ? "You can post only 1 video on your profile. Delete your current video to post another."
        : "You can post up to 10 photos on your profile. Delete a photo to post another.";
      return res.status(409).json({ success: false, message });
    }
    if (!configureCloudinary()) {
      return res.status(503).json({ success: false, message: "Add Cloudinary credentials to BACKEND/.env to enable post uploads." });
    }
    const upload = await uploadToCloudinary(req.file, "hostelcast/posts");
    const post = await ProfilePost.create({
      userId: req.authUserId,
      mediaUrl: upload.secure_url,
      mediaPublicId: upload.public_id,
      mediaType,
      caption: String(req.body?.caption || "").trim().slice(0, 500),
    });
    return res.status(201).json({
      success: true,
      post: {
        id: String(post._id),
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        caption: post.caption,
        createdAt: post.createdAt,
      },
    });
  } catch (error) {
    console.error("Profile post upload failed:", error);
    return res.status(503).json({ success: false, message: "Post upload failed." });
  }
});

router.delete("/:userId/posts/:postId", requireUser, async (req, res) => {
  try {
    if (String(req.authUserId) !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: "You can only delete your own posts." });
    }
    if (!validId(req.params.postId)) return res.status(400).json({ success: false, message: "Invalid post." });
    const post = await ProfilePost.findOneAndDelete({ _id: req.params.postId, userId: req.authUserId });
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    deleteCloudinaryAsset(post.mediaPublicId, post.mediaType === "video" ? "video" : "image")
      .catch((error) => console.error("Deleted media could not be removed from Cloudinary:", error.message));
    return res.json({ success: true });
  } catch (error) {
    console.error("Profile post could not be deleted:", error);
    return res.status(503).json({ success: false, message: "Post could not be deleted." });
  }
});

module.exports = router;
