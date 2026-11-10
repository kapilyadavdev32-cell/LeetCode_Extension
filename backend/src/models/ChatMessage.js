import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: String, required: true },
    clientMessageId: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 50000 },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed"
    },
    mode: { type: String, default: "custom" },
    problemSlug: { type: String, default: "" },
    codeVersionHash: { type: String, default: "" },
    contextChoice: { type: String, enum: ["previous", "updated", "none"], default: "none" },
    errorMessage: { type: String, default: "", maxlength: 500 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatMessageSchema.index({ userId: 1, chatId: 1, createdAt: 1 });
chatMessageSchema.index(
  { userId: 1, chatId: 1, clientMessageId: 1, role: 1 },
  { unique: true }
);

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
