const bcrypt = require("bcryptjs");
const User = require("../Models/User");
const TempUser = require("../Models/TempUser");
const { sendOtpEmail } = require("../MiddleWare/Email");
const { sendError, makeOtp, hashOtp, isStrongPassword, getCollegeFromEmail, isUniversityEmail } = require("./authHelpers");
const { checkOtpCooldown, clearOtpCooldown } = require("./otpRateLimit");

// Signup request frontend ke Name, University Email, College, Gender aur Password ko receive karta hai.
exports.signup = async (req, res) => {
  try {
    const { name, email, password, college = "", gender = "" } = req.body;
    const allowedGenders = ["Male", "Female", "Gay", "Lesbian", "Transgender", "Other"];
    if (!name?.trim() || !email?.trim() || !password) return sendError(res, 400, "Name, email and password are required.");
    if (!allowedGenders.includes(gender)) return sendError(res, 400, "Please select a valid gender.");

    const cleanEmail = String(email).toLowerCase().trim();
    const detectedCollege = getCollegeFromEmail(cleanEmail);
    if (!college.trim() || college.trim().toLowerCase() !== detectedCollege.toLowerCase()) {
      return sendError(res, 400, "College does not match the university email domain.");
    }
    if (!isUniversityEmail(cleanEmail)) return sendError(res, 400, "Please use a valid university email address.");
    if (!isStrongPassword(password)) return sendError(res, 400, "Password does not meet the required format.");
    if (await User.findOne({ email: cleanEmail })) return sendError(res, 409, "An account already exists for this email. Please sign in.");
    const cooldown = await checkOtpCooldown(cleanEmail);
    if (!cooldown.allowed) return res.status(429).json({ success: false, message: "Please wait before requesting another OTP.", retryAfterSeconds: cooldown.retryAfterSeconds });

    const otp = makeOtp();
    const passwordHash = await bcrypt.hash(password, 12);
    await TempUser.findOneAndUpdate(
      { email: cleanEmail },
      { name: name.trim(), email: cleanEmail, password: passwordHash, college: college.trim(), gender, otpHash: hashOtp(otp), otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { upsert: true, runValidators: true }
    );

    try {
      await sendOtpEmail(cleanEmail, otp, name.trim());
      return res.status(200).json({ success: true, message: "OTP sent to your email.", email: cleanEmail });
    } catch (error) {
      await TempUser.deleteOne({ email: cleanEmail });
      await clearOtpCooldown(cleanEmail);
      console.error("OTP email could not be sent:", error.message);
      return sendError(res, 502, "The verification email could not be sent. Please try again.");
    }
  } catch (error) {
    console.error(error);
    return sendError(res, 500, "The signup process could not be completed.");
  }
};
