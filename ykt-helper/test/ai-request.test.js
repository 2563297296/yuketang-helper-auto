import assert from 'node:assert/strict';
import test from 'node:test';

async function loadAI() {
  const originalWindow = globalThis.window;
  globalThis.window = { unsafeWindow: undefined };
  try {
    return await import('../src/ai/openai.js');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

test('normalizes Moonshot Responses and base URLs to Chat Completions', async () => {
  const { makeChatUrl } = await loadAI();

  assert.equal(
    makeChatUrl({ baseUrl: 'https://api.moonshot.cn/v1/responses' }),
    'https://api.moonshot.cn/v1/chat/completions',
  );
  assert.equal(
    makeChatUrl({ baseUrl: 'https://api.moonshot.cn/v1' }),
    'https://api.moonshot.cn/v1/chat/completions',
  );
  assert.equal(
    makeChatUrl({ baseUrl: 'https://api.moonshot.ai' }),
    'https://api.moonshot.ai/v1/chat/completions',
  );
});

test('preserves an explicit custom proxy endpoint', async () => {
  const { makeChatUrl } = await loadAI();
  const customUrl = 'https://proxy.example.test/custom/openai';

  assert.equal(makeChatUrl({ baseUrl: customUrl }), customUrl);
});

test('rejects empty messages before a request can be sent', async () => {
  const { assertValidChatPayload } = await loadAI();

  assert.throws(
    () => assertValidChatPayload({ messages: [] }),
    /messages 为空/,
  );
  assert.throws(
    () => assertValidChatPayload({ messages: [{ role: 'user', content: '' }] }),
    /消息内容为空/,
  );
});

test('vision request uses the corrected endpoint and a non-empty message list', async (t) => {
  const originalWindow = globalThis.window;
  let request;
  globalThis.window = {
    unsafeWindow: undefined,
    GM_xmlhttpRequest(options) {
      request = {
        url: options.url,
        payload: JSON.parse(options.data),
      };
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify({
          choices: [{ message: { content: '答案: A' } }],
        }),
      }));
    },
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const { queryAIVision } = await import('../src/ai/openai.js');
  await queryAIVision('aW1hZ2U=', 'test', {
    profiles: [{
      id: 'kimi',
      baseUrl: 'https://api.moonshot.cn/v1/responses',
      apiKey: 'test-key',
      model: 'kimi-k2.6',
      visionModel: 'kimi-k2.6',
      temperature: '',
    }],
    activeProfileId: 'kimi',
  }, { disableTwoStep: true });

  assert.equal(request.url, 'https://api.moonshot.cn/v1/chat/completions');
  assert.ok(Array.isArray(request.payload.messages));
  assert.ok(request.payload.messages.length > 0);
});
