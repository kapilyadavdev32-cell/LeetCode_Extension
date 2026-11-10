import test from "node:test";
import assert from "node:assert/strict";

const storage = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: storage[key] };
      },
      async set(values) {
        Object.assign(storage, values);
      }
    }
  }
};
await import("../chat-store.js");
const store = globalThis.LocalChatStore;

test.beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
});

test("persists a chat's Mistral conversation and messages across reads", async () => {
  const chat = await store.create();
  await store.savePendingMessage(chat.chatId, {
    clientMessageId: "message-1",
    message: "Help me solve this",
    mode: "hint",
    context: { slug: "two-sum" },
    contextChoice: "updated"
  });
  await store.completeTurn(chat.chatId, {
    clientMessageId: "message-1",
    message: "Help me solve this",
    answer: "Consider a hash map.",
    mode: "hint",
    context: { slug: "two-sum" },
    contextChoice: "updated",
    codeHash: "code-hash",
    contextHash: "context-hash",
    conversationId: "mistral-conversation-1",
    codeReused: false
  });

  const [saved] = await store.list();
  assert.equal(saved.mistralConversationId, "mistral-conversation-1");
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[1].content, "Consider a hash map.");
  assert.equal(saved.lastSharedCodeHash, "code-hash");
});

test("activates only one chat and clears conversation context", async () => {
  const first = await store.create();
  const second = await store.create();
  await store.update(second.chatId, {
    mistralConversationId: "mistral-conversation-2",
    lastSharedCodeHash: "code-hash",
    lastSharedCodeProblemSlug: "two-sum"
  });
  await store.activate(first.chatId);

  assert.equal((await store.list()).filter((chat) => chat.isActive).length, 1);
  assert.equal(await store.forgetCode(second.chatId), true);
  const saved = (await store.list()).find((chat) => chat.chatId === second.chatId);
  assert.equal(saved.mistralConversationId, null);
  assert.equal(saved.lastSharedCodeHash, "");
});