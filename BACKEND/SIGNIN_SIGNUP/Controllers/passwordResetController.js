const bcrypt = require("bcryptjs");
const User = require("../Models/User");
const { sendPasswordResetEmail } = require("../MiddleWare/Email");
const { sendError, makeOtp, hashOtp, isStrongPassword } = require("./authHelpers");

// Registered email milne par password reset OTP create aur email karne ka request handle karta hai.
exports.forgotPassword = async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || "").toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.json({ success: true, message: "If the account exists, a password reset OTP has been sent." });

    const otp = makeOtp();
    await User.updateOne({ _id: user._id }, { resetOtpHash: hashOtp(otp), resetOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    await sendPasswordResetEmail(cleanEmail, otp, user.name);
    return res.json({ success: true, message: "Password reset OTP sent to your email." });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, "Password reset OTP could not be sent.");
  }
};

// OTP match hone aur strong password rules pass hone par new bcrypt hash save karta hai.
exports.resetPassword = async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");
    if (!cleanEmail || !otp || !newPassword) return sendError(res, 400, "Email, OTP and new password are required.");
    if (!isStrongPassword(newPassword)) return sendError(res, 400, "New password does not meet the required format.");

    const user = await User.findOne({ email: cleanEmail }).select("+password +resetOtpHash +resetOtpExpiresAt");
    if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) return sendError(res, 400, "Reset OTP request not found.");
    if (user.resetOtpExpiresAt < new Date()) {
      user.resetOtpHash = "";
      user.resetOtpExpiresAt = null;
      await user.save();
      return sendError(res, 400, "Reset OTP expired. Please request a new one.");
    }
    if (hashOtp(otp) !== user.resetOtpHash) {
      user.resetOtpHash = "";
      user.resetOtpExpiresAt = null;
      await user.save();
      return sendError(res, 400, "Invalid OTP. Please request a new password reset.");
    }
    if (await bcrypt.compare(newPassword, user.password)) return sendError(res, 400, "New password must be different from the old password.");

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetOtpHash = "";
    user.resetOtpExpiresAt = null;
    await user.save();
    return res.json({ success: true, message: "Password reset successfully. You can sign in now." });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, "Password could not be reset.");
  }
};
