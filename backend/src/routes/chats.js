import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Chat } from "../models/Chat.js";
import { ChatMessage } from "../models/ChatMessage.js";

const router = Router();
const modes = [
  "custom",
  "debug",
  "hint",
  "solution",
  "complexity",
  "code-review",
  "optimization",
  "test-case",
  "dry-run",
  "approach-comparison",
  "concept",
  "interview"
];
const sendSchema = z.object({
  clientMessageId: z.string().uuid(),
  message: z.string().trim().min(1).max(10000),
  answer: z.string().trim().min(1).max(50000),
  mistralConversationId: z.string().min(1).max(512),
  mode: z.enum(modes),
  contextChoice: z.enum(["previous", "updated", "none"]),
  context: z.object({
    title: z.string().trim().min(1).max(200),
    url: z.string().url().max(2000),
    slug: z.string().max(200).default(""),
    description: z.string().max(14000),
    programmingLanguage: z.string().max(60).default("Unknown"),
    submissionResults: z.string().max(4000).default("")
  }),
  code: z.string().max(16000).optional()
});

const titleFromMessage = (message) => {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 72 ? `${oneLine.slice(0, 69)}...` : oneLine || "New chat";
};
const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");

function publicChat(chat) {
  return {
    chatId: chat.chatId,
    mistralConversationId: chat.mistralConversationId || null,
    title: chat.title,
    isActive: chat.isActive,
    lastMessageAt: chat.lastMessageAt,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    turnCount: chat.turnCount,
    lastContextHash: chat.lastContextHash,
    lastSharedCodeHash: chat.lastSharedCodeHash,
    lastSharedCodeProblemSlug: chat.lastSharedCodeProblemSlug
  };
}

async function findOwnedChat(userId, chatId) {
  return Chat.findOne({ userId, chatId }).select(
    "+mistralConversationId +lastSharedCode +lockUntil +lockRequestId"
  );
}

async function acquireChatLock(chat, requestId) {
  const now = new Date();
  return Chat.findOneAndUpdate(
    {
      _id: chat._id,
      $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }]
    },
    {
      $set: {
        lockUntil: new Date(now.getTime() + 120000),
        lockRequestId: requestId
      }
    },
    { new: true }
  ).select("+mistralConversationId +lastSharedCode +lockUntil +lockRequestId");
}

async function releaseChatLock(chatId, requestId) {
  await Chat.updateOne(
    { _id: chatId, lockRequestId: requestId },
    { $set: { lockUntil: null, lockRequestId: null } }
  );
}

router.post("/", async (request, response) => {
  const chat = await Chat.create({
    userId: request.user._id,
    chatId: randomUUID(),
    title: "New chat",
    isActive: false
  });
  await Chat.updateMany(
    { userId: request.user._id, isActive: true },
    { $set: { isActive: false } }
  );
  chat.isActive = true;
  await chat.save();
  response.status(201).json({ chat: publicChat(chat) });
});

router.get("/", async (request, response) => {
  const chats = await Chat.find({ userId: request.user._id })
    .select("+mistralConversationId")
    .sort({ isActive: -1, lastMessageAt: -1 })
    .lean();
  response.json({ chats });
});

router.get("/active", async (request, response) => {
  const chat = await Chat.findOne({ userId: request.user._id, isActive: true })
    .select("+mistralConversationId")
    .lean();
  response.json({ chat });
});

router.get("/:chatId/messages", async (request, response) => {
  const chat = await findOwnedChat(request.user._id, request.params.chatId);
  if (!chat) return response.status(404).json({ error: "Chat not found." });

  const messages = await ChatMessage.find({
    userId: request.user._id,
    chatId: chat.chatId
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(2000)
    .lean();
  response.json({ messages });
});

router.patch("/:chatId", async (request, response) => {
  const schema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    mistralConversationId: z.string().min(1).max(512).nullable().optional()
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success || !Object.keys(parsed.data || {}).length) {
    return response.status(400).json({ error: "Provide valid chat updates." });
  }
  const chat = await findOwnedChat(request.user._id, request.params.chatId);
  if (!chat) return response.status(404).json({ error: "Chat not found." });

  if (parsed.data.isActive === true) {
    await Chat.updateMany(
      { userId: request.user._id, isActive: true },
      { $set: { isActive: false } }
    );
  }
  if (parsed.data.title !== undefined) chat.title = parsed.data.title;
  if (parsed.data.isActive !== undefined) chat.isActive = parsed.data.isActive;
  if (parsed.data.mistralConversationId !== undefined) {
    chat.mistralConversationId = parsed.data.mistralConversationId;
  }
  await chat.save();
  response.json({ chat: publicChat(chat) });
});

router.delete("/:chatId/messages", async (request, response) => {
  const chat = await findOwnedChat(request.user._id, request.params.chatId);
  if (!chat) return response.status(404).json({ error: "Chat not found." });
  const requestId = randomUUID();
  const lock = await acquireChatLock(chat, requestId);
  if (!lock) {
    return response.status(409).json({ error: "Wait for the current response before clearing this chat." });
  }
  try {
    await ChatMessage.deleteMany({ userId: request.user._id, chatId: lock.chatId });
    lock.mistralConversationId = null;
    lock.title = "New chat";
    lock.lastMessageAt = new Date();
    lock.lastSharedCode = "";
    lock.lastSharedCodeHash = "";
    lock.lastSharedCodeProblemSlug = "";
    lock.lastContextHash = "";
    lock.turnCount = 0;
    await lock.save();
    response.json({ chat: publicChat(lock), aiContextReset: true });
  } finally {
    await releaseChatLock(lock._id, requestId);
  }
});

router.delete("/:chatId/code-context", async (request, response) => {
  const chat = await findOwnedChat(request.user._id, request.params.chatId);
  if (!chat) return response.status(404).json({ error: "Chat not found." });
  const requestId = randomUUID();
  const lock = await acquireChatLock(chat, requestId);
  if (!lock) {
    return response.status(409).json({ error: "Wait for the current response before forgetting code." });
  }
  try {
    if (!lock.lastSharedCodeHash) {
      return response.json({ forgotten: false, chat: publicChat(lock) });
    }

    lock.mistralConversationId = null;
    lock.lastSharedCode = "";
    lock.lastSharedCodeHash = "";
    lock.lastSharedCodeProblemSlug = "";
    lock.lastContextHash = "";
    lock.turnCount = 0;
    await lock.save();
    response.json({ forgotten: true, contextReset: true, chat: publicChat(lock) });
  } finally {
    await releaseChatLock(lock._id, requestId);
  }
});

router.delete("/:chatId", async (request, response) => {
  const chat = await findOwnedChat(request.user._id, request.params.chatId);
  if (!chat) return response.status(404).json({ error: "Chat not found." });
  const requestId = randomUUID();
  const lock = await acquireChatLock(chat, requestId);
  if (!lock) {
    return response.status(409).json({ error: "Wait for the current response before deleting this chat." });
  }
  try {
    await ChatMessage.deleteMany({ userId: request.user._id, chatId: lock.chatId });
    await lock.deleteOne();
    response.json({ deleted: true });
  } finally {
    await releaseChatLock(lock._id, requestId);
  }
});

router.post("/:chatId/messages", async (request, response) => {
  const parsed = sendSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: "Invalid chat message or context.",
      details: parsed.error.issues.map(({ path, message }) => ({ path: path.join("."), message }))
    });
  }

  const data = parsed.data;
  const chat = await findOwnedChat(request.user._id, request.params.chatId);
  if (!chat) return response.status(404).json({ error: "Chat not found." });

  const existingUserMessage = await ChatMessage.findOne({
    userId: request.user._id,
    chatId: chat.chatId,
    clientMessageId: data.clientMessageId,
    role: "user"
  });
  if (existingUserMessage) {
    const savedAssistantMessage = await ChatMessage.findOne({
      userId: request.user._id,
      chatId: chat.chatId,
      clientMessageId: data.clientMessageId,
      role: "assistant"
    });
    if (savedAssistantMessage) {
      return response.json({
        userMessage: existingUserMessage,
        assistantMessage: savedAssistantMessage,
        chat: publicChat(chat)
      });
    }
  }

  const lock = await acquireChatLock(chat, data.clientMessageId);
  if (!lock) return response.status(409).json({ error: "Another message is being processed for this chat." });

  let userMessage;
  let responseStatus = 502;
  try {
    if (existingUserMessage) {
      existingUserMessage.status = "pending";
      existingUserMessage.errorMessage = "";
      existingUserMessage.content = data.message;
      existingUserMessage.mode = data.mode;
      existingUserMessage.problemSlug = data.context.slug;
      existingUserMessage.contextChoice = data.contextChoice;
      userMessage = await existingUserMessage.save();
    } else {
      userMessage = await ChatMessage.create({
        userId: request.user._id,
        chatId: lock.chatId,
        clientMessageId: data.clientMessageId,
        role: "user",
        content: data.message,
        status: "pending",
        mode: data.mode,
        problemSlug: data.context.slug,
        contextChoice: data.contextChoice
      });
    }

    const contextHash = hash(JSON.stringify(data.context));
    let codeHash = "";
    let codeReused = false;
    if (data.contextChoice === "previous") {
      if (!lock.lastSharedCodeHash) {
        responseStatus = 400;
        throw new Error("No code has been shared in this chat yet.");
      }
      if (lock.lastSharedCodeProblemSlug !== data.context.slug) {
        responseStatus = 400;
        throw new Error("Previously shared code belongs to a different problem. Choose Updated Code or No Code.");
      }
      codeHash = lock.lastSharedCodeHash;
      codeReused = true;
    } else if (data.contextChoice === "updated") {
      if (data.code === undefined || !data.code.trim()) {
        responseStatus = 400;
        throw new Error("Updated Code was selected, but no editor code was detected.");
      }
      codeHash = hash(data.code);
      codeReused =
        codeHash === lock.lastSharedCodeHash &&
        lock.lastSharedCodeProblemSlug === data.context.slug;
    }

    userMessage.status = "completed";
    userMessage.codeVersionHash = codeHash;
    userMessage.errorMessage = "";
    await userMessage.save();
    const assistantMessage = await ChatMessage.create({
      userId: request.user._id,
      chatId: lock.chatId,
      clientMessageId: data.clientMessageId,
      role: "assistant",
      content: data.answer,
      status: "completed",
      mode: data.mode,
      problemSlug: data.context.slug,
      codeVersionHash: codeHash,
      contextChoice: data.contextChoice
    });

    lock.title = lock.title === "New chat" ? titleFromMessage(data.message) : lock.title;
    lock.lastMessageAt = new Date();
    lock.lastContextHash = contextHash;
    lock.mistralConversationId = data.mistralConversationId;
    lock.turnCount += 1;
    if (data.contextChoice === "updated" && codeHash) {
      lock.lastSharedCode = data.code;
      lock.lastSharedCodeHash = codeHash;
      lock.lastSharedCodeProblemSlug = data.context.slug;
    }
    await lock.save();

    response.json({
      userMessage,
      assistantMessage,
      chat: publicChat(lock),
      codeReused
    });
  } catch (error) {
    if (userMessage) {
      userMessage.status = "failed";
      userMessage.errorMessage = error.message.slice(0, 500);
      await userMessage.save();
    }
    if (error.status) throw error;
    console.error("Chat message persistence failed:", error.message);
    error.status = responseStatus;
    throw error;
  } finally {
    await releaseChatLock(lock._id, data.clientMessageId);
  }
});

export default router;
