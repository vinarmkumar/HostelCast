const mongoose = require("mongoose");

const userFollowSchema = new mongoose.Schema(
  {
    followerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    followingId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

userFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
userFollowSchema.index({ followingId: 1, followerId: 1 });

module.exports = mongoose.models.UserFollow || mongoose.model("UserFollow", userFollowSchema);
