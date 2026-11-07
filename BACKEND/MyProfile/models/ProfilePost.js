const mongoose = require("mongoose");

const profilePostSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mediaUrl: { type: String, required: true },
    mediaPublicId: { type: String, required: true },
    mediaType: { type: String, enum: ["image", "video"], required: true },
    caption: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.ProfilePost || mongoose.model("ProfilePost", profilePostSchema);
