const crypto = require("crypto");

// Har controller error ko same JSON format mein frontend ko bhejta hai.
function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

// Signup aur password reset dono ke liye 6-digit OTP banata hai; value email par send hoti hai.
function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Plain OTP database mein nahi rakha jaata; SHA-256 hash save aur verify hota hai.
function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

// Password mein uppercase, lowercase, digit, special character aur minimum length required hoti hai.
function isStrongPassword(password) {
  return typeof password === "string"
    && password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[@#$%^&*]/.test(password);
}

const collegeDomainMap = {
  "lpu.in": "Lovely Professional University (LPU)",
  "kiit.ac.in": "Kalinga Institute of Industrial Technology (KIIT)",
  "iitb.ac.in": "IIT Bombay",
  "du.ac.in": "Delhi University (DU)",
  "nift.ac.in": "National Institute of Fashion Technology (NIFT)",
  "aiims.ac.in": "All India Institute of Medical Sciences (AIIMS)",
  "iisc.ac.in": "Indian Institute of Science (IISc)",
  "iisc.edu.in": "Indian Institute of Science (IISc)",
  "bits-pilani.ac.in": "BITS Pilani",
  "thapar.edu.in": "Thapar Institute of Engineering and Technology",
};

const collegeAcronyms = {
  lpu: "Lovely Professional University (LPU)",
  kiit: "Kalinga Institute of Industrial Technology (KIIT)",
  iit: "Indian Institute of Technology",
  du: "Delhi University (DU)",
  nift: "National Institute of Fashion Technology (NIFT)",
  aiims: "All India Institute of Medical Sciences (AIIMS)",
  iisc: "Indian Institute of Science (IISc)",
};

// Email domain se college ka naam detect hota hai; frontend aur backend dono isi mapping ka use karte hain.
function getCollegeFromEmail(email) {
  const domain = String(email).split("@")[1] || "";
  const firstLabel = domain.split(".")[0];
  return collegeDomainMap[domain] || collegeAcronyms[firstLabel] || firstLabel
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const publicEmailDomains = ["gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "icloud.com"];

// Public/free email reject karke allowed university suffix check karta hai.
function isUniversityEmail(email) {
  const domain = String(email).split("@")[1] || "";
  if (publicEmailDomains.includes(domain)) return false;
  const configuredDomains = process.env.UNIVERSITY_EMAIL_DOMAINS || ".ac.in,.edu.in,.edu,.in,.res.in,.org.in,.org,.co.in,.com,.net";
  const allowedDomains = configuredDomains.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allowedDomains.some((allowedDomain) => {
    const suffix = allowedDomain.startsWith(".") ? allowedDomain : `.${allowedDomain}`;
    return domain === suffix.slice(1) || domain.endsWith(suffix);
  });
}

module.exports = { sendError, makeOtp, hashOtp, isStrongPassword, getCollegeFromEmail, isUniversityEmail };
