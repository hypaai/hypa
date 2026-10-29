import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentStreamError } from '@hypa/intelligence-core/agent-stream';
import { fitChatImage, runChatTurn } from './chat-turn';

const body = {
  requestId: 'req-1',
  input: 'Translate good morning into Yoruba',
  surface: 'app' as const,
  provider: 'meta',
  model: 'muse-spark-1.3',
};

test('fitChatImage keeps the long edge at 1600 and leaves smaller photos', () => {
  assert.deepEqual(fitChatImage(3200, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitChatImage(800, 600), { width: 800, height: 600 });
});

test('a dropped stream resumes with GET and does not POST again', async () => {
  let posts = 0;
  let gets = 0;
  const events: string[] = [];
  await runChatTurn({
    connection: {
      baseUrl: 'https://api.example.com',
      fetch: (async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts += 1;
          throw new Error('socket closed');
        }
        gets += 1;
        return new Response(JSON.stringify({ status: 'done', message: 'Ẹ káàárọ̀', chatId: 'c1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch,
    },
    body,
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event.type),
    onReconnect: () => events.push('reconnect'),
  });
  assert.equal(posts, 1);
  assert.equal(gets, 1);
  assert.deepEqual(events, ['reconnect', 'done']);
});

test('a rejected POST is not resumed', async () => {
  let gets = 0;
  await assert.rejects(
    () =>
      runChatTurn({
        connection: {
          baseUrl: 'https://api.example.com',
          fetch: (async (_url: string, init?: RequestInit) => {
            if (init?.method !== 'POST') gets += 1;
            return new Response(JSON.stringify({ message: 'no' }), { status: 401 });
          }) as typeof fetch,
        },
        body,
        signal: new AbortController().signal,
        onEvent: () => undefined,
        onReconnect: () => undefined,
      }),
    AgentStreamError,
  );
  assert.equal(gets, 0);
});
