// Permanent MongoDB user document banane ke liye Mongoose import hua hai.
const mongoose = require("mongoose");
const liveScheduleSchema = new mongoose.Schema(
  {
    days: { type: [String], default: [] },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    timezone: { type: String, default: "" },
  },
  { _id: false }
);

// Ye file database mein ek student ka naam, email aur password rakhti hai.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Signup form ka naam User document mein rakha jayega.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // Email unique hai aur sign-in se match karne ke liye lowercase hoti hai.
    password: { type: String, required: true, select: false }, // bcrypt hash store hota hai aur normal query se password chupaa rehta hai.
    college: { type: String, trim: true }, // College ka text SignUp.jsx se aa kar controller ke through yahan aata hai.
    category: { type: String, enum: ["Engineering", "Medical", "Arts", "Other", ""], default: "" },
    gender: { type: String, enum: ["Male", "Female", "Gay", "Lesbian", "Transgender", "Other"], required: true },
    avatarUrl: { type: String, default: "" },
    avatarPublicId: { type: String, default: "" },
    avatarCleanupPublicIds: { type: [String], default: [] },
    bio: {
      type: String,
      default: "",
      validate: {
        validator: (value) => String(value || "").trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length <= 80,
        message: "Bio cannot exceed 80 words.",
      },
    },
    hookupEnabled: { type: Boolean, default: false },
    hookupInstagram: { type: String, default: "" },
    hookupWhatsApp: { type: String, default: "" },
    hookupSnapchat: { type: String, default: "" },
    liveSchedule: { type: liveScheduleSchema, default: null },
    isVerified: { type: Boolean, default: true },
    resetOtpHash: { type: String, select: false, default: "" }, // Password reset OTP database mein plain text nahi hota.
    resetOtpExpiresAt: { type: Date, select: false, default: null }, // Reset OTP sirf limited samay ke liye valid hota hai.
    loginAttempts: { type: Number, select: false, default: 0 }, // Wrong sign-in attempts ki database count.
    loginLockUntil: { type: Date, select: false, default: null }, // Temporary 60-second login lock ka expiry time.
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
