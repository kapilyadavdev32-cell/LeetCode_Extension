import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../mistral.js", import.meta.url), "utf8");

function loadMistralApi({ responses = [] } = {}) {
  const storage = {};
  const requests = [];
  const context = {
    chrome: {
      storage: {
        local: {
          async get(key) {
            return { [key]: storage[key] };
          },
          async set(values) {
            Object.assign(storage, values);
          },
          async remove(key) {
            delete storage[key];
          }
        }
      }
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const next = responses.shift() || { status: 200, body: {} };
      return {
        status: next.status,
        ok: next.status >= 200 && next.status < 300,
        headers: new Headers(),
        async json() {
          return next.body;
        }
      };
    },
    setTimeout,
    Headers,
    TextEncoder,
    crypto: globalThis.crypto
  };
  vm.runInNewContext(source, context);
  return { api: context.MistralApi, storage, requests };
}

test("saves, checks, reuses, and removes the Mistral key in Chrome local storage", async () => {
  const { api, storage, requests } = loadMistralApi({
    responses: [{ status: 200, body: { data: [] } }]
  });
  await api.saveApiKey("  test-mistral-key  ");
  assert.equal(storage.mistralApiKey, "test-mistral-key");
  assert.equal(await api.hasApiKey(), true);

  await api.testApiKey();
  assert.equal(requests[0].url, "https://api.mistral.ai/v1/models");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-mistral-key");

  await api.removeApiKey();
  assert.equal(await api.hasApiKey(), false);
});

test("starts and appends official model conversations and returns updated IDs", async () => {
  const { api, storage, requests } = loadMistralApi({
    responses: [
      {
        status: 200,
        body: {
          conversation_id: "conv_first",
          outputs: [{
            type: "message.output",
            role: "assistant",
            content: [{ type: "text", text: "First answer" }]
          }]
        }
      },
      {
        status: 200,
        body: {
          conversation_id: "conv_second",
          outputs: [{
            type: "message.output",
            role: "assistant",
            content: "Second answer"
          }]
        }
      }
    ]
  });
  await api.saveApiKey("test-mistral-key");

  const first = await api.startConversation({
    prompt: "First user turn",
    instructions: "You are a coding tutor."
  });
  assert.deepEqual({ ...first }, {
    conversationId: "conv_first",
    answer: "First answer"
  });
  assert.equal(requests[0].url, "https://api.mistral.ai/v1/conversations");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: "mistral-medium-latest",
    inputs: "First user turn",
    instructions: "You are a coding tutor.",
    stream: false
  });
  assert.equal(JSON.parse(requests[0].options.body).agent_id, undefined);

  const second = await api.appendConversation(first.conversationId, "Second user turn");
  assert.deepEqual({ ...second }, {
    conversationId: "conv_second",
    answer: "Second answer"
  });
  assert.equal(
    requests[1].url,
    "https://api.mistral.ai/v1/conversations/conv_first"
  );
  assert.equal(requests[1].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    inputs: "Second user turn",
    stream: false
  });
  assert.equal(storage.mistralApiKey, "test-mistral-key");
});

test("deletes a conversation through the documented endpoint and accepts already removed IDs", async () => {
  const { api, requests } = loadMistralApi({
    responses: [
      { status: 204, body: null },
      { status: 404, body: { message: "Not found" } }
    ]
  });
  await api.saveApiKey("test-mistral-key");

  await api.deleteConversation("conv_delete");
  await api.deleteConversation("conv_already_deleted");
  assert.equal(requests[0].url, "https://api.mistral.ai/v1/conversations/conv_delete");
  assert.equal(requests[0].options.method, "DELETE");
  assert.equal(
    requests[1].url,
    "https://api.mistral.ai/v1/conversations/conv_already_deleted"
  );
});
