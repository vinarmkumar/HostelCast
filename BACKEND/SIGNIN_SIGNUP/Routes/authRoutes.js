// Express router banane ke liye library import ki ja rahi hai.
const express = require("express");
// Har feature ka controller alag hai, isliye signup, login aur password-reset logic mix nahi hota.
const { signup } = require("../Controllers/signupController");
const { verifyOtp } = require("../Controllers/verifyOtpController");
const { signin } = require("../Controllers/signinController");
const { forgotPassword, resetPassword } = require("../Controllers/passwordResetController");

// Is file ka router index.js ke /api/auth ke neeche mount kiya jayega.
const router = express.Router();
router.post("/signup", signup); // SignUp.jsx POST /api/auth/signup par signup controller ko call karega.
router.post("/verify-otp", verifyOtp); // OTP form verifyOtp controller ko call karegi.
router.post("/signin", signin); // SignIn.jsx POST /api/auth/signin par signin controller ko call karega.
router.post("/forgot-password", forgotPassword); // Registered email par password reset OTP bhejta hai.
router.post("/reset-password", resetPassword); // OTP verify karke new password save karta hai.

// Pura router index.js file ko available karaya jaata hai.
module.exports = router;
