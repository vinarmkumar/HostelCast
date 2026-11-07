// Database se baat karne ke liye Mongoose library import ho rahi hai.
const mongoose = require("mongoose");

function getConnectionError(error) {
  if (error?.code === 18 || error?.codeName === "AuthenticationFailed") {
    return new Error("MongoDB authentication failed. Check the Atlas database username/password in MONGO_URI and URL-encode any special characters.");
  }

  if (
    error?.name === "MongooseServerSelectionError"
    || error?.name === "MongoServerSelectionError"
    || error?.name === "MongoNetworkError"
  ) {
    return new Error(
      "MongoDB Atlas is unreachable. In Atlas, add your current public IP (/32) under Security > Network Access, confirm the cluster is running, and check MONGO_URI, VPN, and firewall access. Avoid 0.0.0.0/0 except for temporary testing."
    );
  }

  if (["ENOTFOUND", "EAI_AGAIN"].includes(error?.code)) {
    return new Error("MongoDB hostname could not be resolved. Check MONGO_URI and your DNS/network connection.");
  }

  return new Error(`MongoDB connection failed (${error?.name || "unknown error"}). Check MONGO_URI and Atlas network access.`);
}

// MongoDB connection ko alag function mein rakha hai, taaki server/index.js file chhoti aur understandable rahe.
async function connectDatabase() {
  // .env file se MongoDB connection string environment variable ke roop mein milti hai.
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI .env file mein nahi mila.");
  // MONGO_URI ko Mongoose ko diya jaata hai, aur database se connection ho jaata hai.
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (error) {
    throw getConnectionError(error);
  }
  // Connection successful hone par terminal mein Hindi-English confirmation print hoti hai.
  console.log("MongoDB connected successfully.");
}

// index.js ko ye function available karane ke liye export kiya gaya hai.
module.exports = connectDatabase;
