import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: String, required: true },
    mistralConversationId: { type: String, default: null, select: false },
    title: { type: String, required: true, default: "New chat", maxlength: 120 },
    isActive: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: Date.now },
    lastSharedCode: { type: String, default: "", select: false },
    lastSharedCodeHash: { type: String, default: "" },
    lastSharedCodeProblemSlug: { type: String, default: "" },
    lastContextHash: { type: String, default: "" },
    turnCount: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null, select: false },
    lockRequestId: { type: String, default: null, select: false }
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, chatId: 1 }, { unique: true });
chatSchema.index({ userId: 1, isActive: 1, lastMessageAt: -1 });
chatSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export const Chat = mongoose.model("Chat", chatSchema);
