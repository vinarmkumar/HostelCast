const nodemailer = require("nodemailer");
const otpTemplate = require("../Libs/EmailTemplate");

let transporter;

function getTransporter() {
  // Gmail ka account aur 16-digit App Password environment variables se liya jaata hai.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error("Email credentials configured nahi hain.");
  if (!transporter) {
    // Gmail SMTP OTP emails ko university inbox tak bhejta hai; normal account password nahi chalta.
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS.replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

async function sendOtpEmail(email, otp, name) {
  // Authentication aur sender reputation ka verification email ke deliver hone par seedha asar hota hai.
  await getTransporter().sendMail({
    from: `HostelCast <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "HostelCast verification code",
    html: otpTemplate(name, otp),
  });
}

async function sendPasswordResetEmail(email, otp, name) {
  // Same Gmail transporter password reset OTP ke liye styled English email bhejta hai.
  await getTransporter().sendMail({
    from: `HostelCast <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset your HostelCast password",
    html: otpTemplate(name, otp).replace("continue with HostelCast", "reset your HostelCast password"),
  });
}

module.exports = { sendOtpEmail, sendPasswordResetEmail };
