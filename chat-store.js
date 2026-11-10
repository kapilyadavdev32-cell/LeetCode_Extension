(() => {
  const STORAGE_KEY = "sidekickChats";
  let writeQueue = Promise.resolve();

  async function readChats() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  }

  function sortChats(chats) {
    return [...chats].sort((first, second) => {
      if (first.isActive !== second.isActive) return Number(second.isActive) - Number(first.isActive);
      return (second.lastMessageAt || second.createdAt).localeCompare(
        first.lastMessageAt || first.createdAt
      );
    });
  }

  function updateChats(mutator) {
    const operation = writeQueue.then(async () => {
      const chats = await readChats();
      const result = mutator(chats);
      await chrome.storage.local.set({ [STORAGE_KEY]: chats });
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  globalThis.LocalChatStore = {
    async list() {
      return sortChats(await readChats());
    },

    create() {
      return updateChats((chats) => {
        chats.forEach((chat) => {
          chat.isActive = false;
        });
        const now = new Date().toISOString();
        const chat = {
          chatId: crypto.randomUUID(),
          title: "New chat",
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          turnCount: 0,
          mistralConversationId: null,
          lastContextHash: "",
          lastSharedCodeHash: "",
          lastSharedCodeProblemSlug: "",
          messages: []
        };
        chats.push(chat);
        return chat;
      });
    },

    activate(chatId) {
      return updateChats((chats) => {
        for (const chat of chats) chat.isActive = chat.chatId === chatId;
      });
    },

    update(chatId, changes) {
      return updateChats((chats) => {
        const chat = chats.find((item) => item.chatId === chatId);
        if (!chat) throw new Error("Chat not found.");
        if (changes.isActive === true) {
          for (const item of chats) item.isActive = item.chatId === chatId;
        }
        Object.assign(chat, changes, { updatedAt: new Date().toISOString() });
        return chat;
      });
    },

    savePendingMessage(chatId, { clientMessageId, message, mode, context, contextChoice }) {
      return updateChats((chats) => {
        const chat = chats.find((item) => item.chatId === chatId);
        if (!chat) throw new Error("Chat not found.");
        const existing = chat.messages.find(
          (item) => item.clientMessageId === clientMessageId && item.role === "user"
        );
        const userMessage = {
          clientMessageId,
          role: "user",
          content: message,
          status: "pending",
          mode,
          problemSlug: context.slug,
          contextChoice,
          codeVersionHash: "",
          errorMessage: "",
          createdAt: existing?.createdAt || new Date().toISOString()
        };
        if (existing) Object.assign(existing, userMessage);
        else chat.messages.push(userMessage);
      });
    },

    failMessage(chatId, clientMessageId, errorMessage) {
      return updateChats((chats) => {
        const chat = chats.find((item) => item.chatId === chatId);
        const message = chat?.messages.find(
          (item) => item.clientMessageId === clientMessageId && item.role === "user"
        );
        if (message) {
          message.status = "failed";
          message.errorMessage = errorMessage.slice(0, 500);
        }
      });
    },

    completeTurn(chatId, turn) {
      return updateChats((chats) => {
        const chat = chats.find((item) => item.chatId === chatId);
        if (!chat) throw new Error("Chat not found.");
        const now = new Date().toISOString();
        let userMessage = chat.messages.find(
          (item) => item.clientMessageId === turn.clientMessageId && item.role === "user"
        );
        if (!userMessage) {
          userMessage = { clientMessageId: turn.clientMessageId, role: "user" };
          chat.messages.push(userMessage);
        }
        Object.assign(userMessage, {
          content: turn.message,
          status: "completed",
          mode: turn.mode,
          problemSlug: turn.context.slug,
          contextChoice: turn.contextChoice,
          codeVersionHash: turn.codeHash,
          errorMessage: ""
        });
        if (!chat.messages.some(
          (item) => item.clientMessageId === turn.clientMessageId && item.role === "assistant"
        )) {
          chat.messages.push({
            clientMessageId: turn.clientMessageId,
            role: "assistant",
            content: turn.answer,
            status: "completed",
            mode: turn.mode,
            problemSlug: turn.context.slug,
            contextChoice: turn.contextChoice,
            codeVersionHash: turn.codeHash,
            errorMessage: "",
            createdAt: now
          });
        }
        if (chat.title === "New chat") {
          const oneLine = turn.message.replace(/\s+/g, " ").trim();
          chat.title = oneLine.length > 72 ? `${oneLine.slice(0, 69)}...` : oneLine || "New chat";
        }
        chat.lastMessageAt = now;
        chat.updatedAt = now;
        chat.lastContextHash = turn.contextHash;
        chat.mistralConversationId = turn.conversationId;
        chat.turnCount += 1;
        if (turn.contextChoice === "updated" && turn.codeHash) {
          chat.lastSharedCodeHash = turn.codeHash;
          chat.lastSharedCodeProblemSlug = turn.context.slug;
        }
        return { codeReused: turn.codeReused };
      });
    },

    clear(chatId) {
      return updateChats((chats) => {
        const chat = chats.find((item) => item.chatId === chatId);
        if (!chat) throw new Error("Chat not found.");
        Object.assign(chat, {
          title: "New chat",
          lastMessageAt: new Date().toISOString(),
          turnCount: 0,
          mistralConversationId: null,
          lastContextHash: "",
          lastSharedCodeHash: "",
          lastSharedCodeProblemSlug: "",
          messages: []
        });
      });
    },

    forgetCode(chatId) {
      return updateChats((chats) => {
        const chat = chats.find((item) => item.chatId === chatId);
        if (!chat) throw new Error("Chat not found.");
        if (!chat.lastSharedCodeHash) return false;
        Object.assign(chat, {
          turnCount: 0,
          mistralConversationId: null,
          lastContextHash: "",
          lastSharedCodeHash: "",
          lastSharedCodeProblemSlug: ""
        });
        return true;
      });
    },

    remove(chatId) {
      return updateChats((chats) => {
        const index = chats.findIndex((item) => item.chatId === chatId);
        if (index >= 0) chats.splice(index, 1);
      });
    }
  };
})();