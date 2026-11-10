import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/sidekick-test";
process.env.JWT_SECRET ||= "test-secret-with-more-than-thirty-two-characters";

const { default: mongoose } = await import("mongoose");
const { app } = await import("../src/app.js");
const { Chat } = await import("../src/models/Chat.js");
const { ChatMessage } = await import("../src/models/ChatMessage.js");
const { User } = await import("../src/models/User.js");
const { config } = await import("../src/config.js");
const { issueToken } = await import("../src/middleware/auth.js");

async function listen() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return server;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test(
  "MongoDB persists separate Mistral chat IDs and chat lifecycle operations",
  { skip: process.env.RUN_MONGO_INTEGRATION_TESTS !== "1" },
  async () => {
    const databaseName = `sidekick_integration_${randomUUID().replaceAll("-", "")}`;
    await mongoose.connect(config.mongoUri, { dbName: databaseName, autoIndex: false });

    let server;
    let baseUrl;
    let user;
    try {
      user = await User.create({
        email: `${randomUUID()}@sidekick.test`,
        passwordHash: "integration-test-only"
      });
      const token = issueToken(user._id);
      server = await listen();
      baseUrl = `http://127.0.0.1:${server.address().port}`;

      const request = async (path, { method = "GET", body } = {}) => {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const result = response.status === 204 ? null : await response.json();
        assert.ok(response.ok, result?.error || `${method} ${path}: ${response.status}`);
        return result;
      };

      const firstChat = (await request("/api/chats", { method: "POST", body: {} })).chat;
      const secondChat = (await request("/api/chats", { method: "POST", body: {} })).chat;
      assert.notEqual(firstChat.chatId, secondChat.chatId);
      assert.equal(firstChat.mistralConversationId, null);
      assert.equal(secondChat.mistralConversationId, null);

      await request(`/api/chats/${firstChat.chatId}`, {
        method: "PATCH",
        body: { isActive: true, mistralConversationId: "conv_first_chat" }
      });
      await request(`/api/chats/${secondChat.chatId}`, {
        method: "PATCH",
        body: { mistralConversationId: "conv_second_chat" }
      });

      const context = {
        title: "Two Sum",
        url: "https://leetcode.com/problems/two-sum/",
        slug: "two-sum",
        description: "Find two values that add to a target.",
        programmingLanguage: "Python",
        submissionResults: ""
      };
      const send = async (chatId, { message, code, conversationId = "conv_first_chat" } = {}) => request(
        `/api/chats/${chatId}/messages`,
        {
          method: "POST",
          body: {
            clientMessageId: randomUUID(),
            message,
            answer: "Mocked Mistral answer",
            mistralConversationId: conversationId,
            mode: "custom",
            contextChoice: code ? "updated" : "none",
            context,
            ...(code ? { code } : {})
          }
        }
      );

      await send(firstChat.chatId, { message: "First turn", code: "class Solution: pass" });
      const firstChatRecord = await Chat.findOne({ chatId: firstChat.chatId }).select(
        "+mistralConversationId +lastSharedCode"
      );
      assert.equal(firstChatRecord.mistralConversationId, "conv_first_chat");
      assert.equal(firstChatRecord.lastSharedCode, "class Solution: pass");

      let chats = (await request("/api/chats")).chats;
      assert.equal(chats.find((chat) => chat.chatId === firstChat.chatId).mistralConversationId, "conv_first_chat");
      assert.equal(chats.find((chat) => chat.chatId === secondChat.chatId).mistralConversationId, "conv_second_chat");

      await close(server);
      server = null;
      server = await listen();
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      chats = (await request("/api/chats")).chats;
      assert.equal(chats.find((chat) => chat.isActive).chatId, firstChat.chatId);
      assert.equal(chats.find((chat) => chat.chatId === firstChat.chatId).mistralConversationId, "conv_first_chat");

      await request(`/api/chats/${firstChat.chatId}/messages`, { method: "DELETE" });
      let messages = (await request(`/api/chats/${firstChat.chatId}/messages`)).messages;
      assert.equal(messages.length, 0);
      assert.equal(
        (await Chat.findOne({ chatId: firstChat.chatId }).select("+mistralConversationId"))
          .mistralConversationId,
        null
      );

      await request(`/api/chats/${firstChat.chatId}`, {
        method: "PATCH",
        body: { mistralConversationId: "conv_forget_code" }
      });
      await send(firstChat.chatId, {
        message: "Share code",
        code: "class Solution: return 1",
        conversationId: "conv_forget_code"
      });
      const forgetResult = await request(`/api/chats/${firstChat.chatId}/code-context`, {
        method: "DELETE"
      });
      assert.equal(forgetResult.forgotten, true);
      messages = (await request(`/api/chats/${firstChat.chatId}/messages`)).messages;
      assert.equal(messages.length, 2);
      assert.equal(forgetResult.chat.mistralConversationId, null);

      await request(`/api/chats/${secondChat.chatId}`, { method: "DELETE" });
      assert.equal((await request("/api/chats")).chats.some((chat) => chat.chatId === secondChat.chatId), false);
      const notFound = await fetch(`${baseUrl}/api/chats/${secondChat.chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(notFound.status, 404);
    } finally {
      if (server) await close(server);
      if (user) {
        await ChatMessage.deleteMany({ userId: user._id });
        await Chat.deleteMany({ userId: user._id });
        await User.deleteOne({ _id: user._id });
      }
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
);
