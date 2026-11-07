// OTP verification se pehle temporary signup data ke schema ke liye Mongoose import hua hai.
const mongoose = require("mongoose");

// OTP verify hone tak signup ki information temporary rakhi jaati hai.
const tempUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    college: { type: String, trim: true, default: "" },
    gender: { type: String, enum: ["Male", "Female", "Gay", "Lesbian", "Transgender", "Other"], required: true },
    otpHash: { type: String, required: true }, // Plain OTP ke badle is SHA hash ki verification hoti hai.
    otpExpiresAt: { type: Date, required: true, expires: 600 }, // Ye expiry MongoDB ko 10 minute ke baad record khud delete karne ko bhi keh sakti hai.
  },
  { timestamps: true }
);

tempUserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.models.TempUser || mongoose.model("TempUser", tempUserSchema);
