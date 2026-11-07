const mongoose = require("mongoose");

const hookupRequestSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, default: "", trim: true, maxlength: 1000 },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

hookupRequestSchema.index({ senderId: 1, recipientId: 1 }, { unique: true });
hookupRequestSchema.index({ recipientId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.HookupRequest || mongoose.model("HookupRequest", hookupRequestSchema);
