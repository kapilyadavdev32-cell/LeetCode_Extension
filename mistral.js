(() => {
  const BASE_URL = "https://api.mistral.ai/v1";
  const MODEL = "mistral-medium-latest";
  const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

  async function getApiKey() {
    const { mistralApiKey } = await chrome.storage.local.get("mistralApiKey");
    if (!mistralApiKey) {
      throw new Error("Save your Mistral API key in Sidekick settings first.");
    }
    return mistralApiKey;
  }

  async function request(path, { method = "GET", body, allowNotFound = false } = {}) {
    const apiKey = await getApiKey();
    let response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
      } catch (error) {
        throw new Error(`Couldn't reach Mistral AI. Check your connection and try again. ${error.message}`);
      }

      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= 2) break;
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : 500 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (response.status === 204) return null;
    let result;
    try {
      result = await response.json();
    } catch {
      if (response.ok) throw new Error("Mistral returned an invalid response.");
      result = {};
    }
    if (response.status === 404 && allowNotFound) return null;
    if (!response.ok) {
      const detail = result.message || result.detail || result.error?.message;
      if (response.status === 401) {
        throw new Error("Mistral rejected the API key. Check it in Sidekick settings.");
      }
      if (response.status === 429) {
        throw new Error(detail || "Mistral rate limit reached. Wait briefly and try again.");
      }
      throw new Error(detail || `Mistral API request failed (${response.status}).`);
    }
    return result;
  }

  function responseText(result) {
    const text = result.outputs
      .filter((entry) => entry.type === "message.output" && entry.role === "assistant")
      .flatMap((entry) => {
        if (typeof entry.content === "string") return [entry.content];
        return entry.content
          .filter((chunk) => chunk.type === "text")
          .map((chunk) => chunk.text);
      })
      .join("")
      .trim();
    if (!text) throw new Error("Mistral returned no assistant text. Try again.");
    return text;
  }

  globalThis.MistralApi = {
    async saveApiKey(value) {
      const apiKey = value.trim();
      if (!apiKey) throw new Error("Enter a Mistral API key.");
      await chrome.storage.local.set({ mistralApiKey: apiKey });
    },

    async removeApiKey() {
      await chrome.storage.local.remove("mistralApiKey");
    },

    async hasApiKey() {
      const { mistralApiKey } = await chrome.storage.local.get("mistralApiKey");
      return Boolean(mistralApiKey);
    },

    async testApiKey() {
      await request("/models");
    },

    async startConversation({ prompt, instructions }) {
      const result = await request("/conversations", {
        method: "POST",
        body: { model: MODEL, inputs: prompt, instructions, stream: false }
      });
      if (!result.conversation_id || !Array.isArray(result.outputs)) {
        throw new Error("Mistral returned an invalid conversation response.");
      }
      return {
        conversationId: result.conversation_id,
        answer: responseText(result)
      };
    },

    async appendConversation(conversationId, prompt) {
      const result = await request(`/conversations/${encodeURIComponent(conversationId)}`, {
        method: "POST",
        body: { inputs: prompt, stream: false }
      });
      if (!result.conversation_id || !Array.isArray(result.outputs)) {
        throw new Error("Mistral returned an invalid conversation response.");
      }
      return {
        conversationId: result.conversation_id,
        answer: responseText(result)
      };
    },

    async deleteConversation(conversationId) {
      if (!conversationId) return;
      await request(`/conversations/${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
        allowNotFound: true
      });
    }
  };
})();
