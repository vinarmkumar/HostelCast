const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const TempUser = require("../Models/TempUser");
const { sendError, hashOtp } = require("./authHelpers");

// OTP screen se email aur code receive hokar temporary signup ko permanent account banata hai.
exports.verifyOtp = async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || "").toLowerCase().trim();
    const cleanOtp = String(req.body.otp || "").trim();
    if (!cleanEmail || !cleanOtp) return sendError(res, 400, "Email and OTP are required.");

    const pending = await TempUser.findOne({ email: cleanEmail });
    if (!pending) return sendError(res, 400, "OTP verification record not found. Please sign up again.");
    if (pending.otpExpiresAt < new Date()) {
      await TempUser.deleteOne({ _id: pending._id });
      return sendError(res, 400, "OTP expired. Please sign up again.");
    }
    if (hashOtp(cleanOtp) !== pending.otpHash) {
      await TempUser.deleteOne({ _id: pending._id });
      return sendError(res, 400, "Invalid OTP. Please sign up again.");
    }
    if (await User.findOne({ email: cleanEmail })) {
      await TempUser.deleteOne({ _id: pending._id });
      return sendError(res, 409, "This account already exists.");
    }

    const user = await User.create({
      name: pending.name,
      email: pending.email,
      password: pending.password,
      college: pending.college,
      gender: pending.gender,
    });
    await TempUser.deleteOne({ _id: pending._id });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.status(201).json({
      success: true,
      message: "Account verified and created!",
      token,
      user: { id: user._id, name: user.name, email: user.email, college: user.college, gender: user.gender, avatarUrl: user.avatarUrl || "" },
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, "OTP could not be verified.");
  }
};
