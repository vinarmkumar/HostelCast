const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const { sendError } = require("./authHelpers");

// Sign-in credentials ko verify karke JWT token banata hai aur failed attempts ko database mein count karta hai.
exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return sendError(res, 400, "Email and password are required.");

    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
      .select("+password +loginAttempts +loginLockUntil");
    if (!user) return sendError(res, 401, "Email or password is incorrect.");

    const now = new Date();
    if (user.loginLockUntil && user.loginLockUntil > now) {
      const retryAfterSeconds = Math.ceil((user.loginLockUntil - now) / 1000);
      return res.status(429).json({ success: false, message: `Too many failed attempts. Try again in ${retryAfterSeconds} seconds.`, retryAfterSeconds });
    }
    if (user.loginLockUntil && user.loginLockUntil <= now) {
      user.loginAttempts = 0;
      user.loginLockUntil = null;
    }

    if (!(await bcrypt.compare(password, user.password))) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        user.loginLockUntil = new Date(Date.now() + 60 * 1000);
        await user.save();
        return res.status(429).json({ success: false, message: "Too many failed attempts. Try again in 60 seconds.", retryAfterSeconds: 60 });
      }
      await user.save();
      return sendError(res, 401, "Email or password is incorrect.");
    }

    user.loginAttempts = 0;
    user.loginLockUntil = null;
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    // Profile page ko college aur gender dikhane ke liye ye values login response mein bhejta hai.
    return res.json({ success: true, message: "Welcome back!", token, user: { id: user._id, name: user.name, email: user.email, college: user.college, gender: user.gender, avatarUrl: user.avatarUrl || "" } });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, "Sign in could not be completed.");
  }
};
