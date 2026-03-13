import test from 'node:test';
import assert from 'node:assert/strict';

import { TrelloClient } from '../build/trello-client.js';
import { createAxiosError, createFakeAxios } from './helpers.js';

function createClient(fakeAxios) {
  const client = new TrelloClient({
    apiKey: 'key',
    token: 'token',
    boardId: 'board-1',
  });

  client.axiosInstance = fakeAxios;
  client.rateLimiter = {
    waitForAvailable: async () => {},
  };

  return client;
}

test('getCardsByList rejects lists outside the configured board', async () => {
  const client = createClient(
    createFakeAxios({
      get: async path => {
        if (path === '/lists/list-1/board') {
          return { data: { id: 'board-2' } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
    })
  );

  await assert.rejects(
    client.getCardsByList('list-1'),
    /outside the configured board scope/
  );
});

test('getCardsByList fetches cards after board-scope validation', async () => {
  const calls = [];
  const cards = [{ id: 'card-1', name: 'Card', idList: 'list-1', idLabels: [], closed: false, url: '', dateLastActivity: '', desc: '', due: null }];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(path);

        if (path === '/lists/list-1/board') {
          return { data: { id: 'board-1' } };
        }

        if (path === '/lists/list-1/cards') {
          return { data: cards };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
    })
  );

  const result = await client.getCardsByList('list-1');

  assert.deepEqual(result, cards);
  assert.deepEqual(calls, ['/lists/list-1/board', '/lists/list-1/cards']);
});

test('getMyCards filters cards down to the configured board', async () => {
  const client = createClient(
    createFakeAxios({
      get: async path => {
        assert.equal(path, '/members/me/cards');
        return {
          data: [
            { id: 'card-1', idBoard: 'board-1' },
            { id: 'card-2', idBoard: 'board-2' },
          ],
        };
      },
    })
  );

  const result = await client.getMyCards();

  assert.deepEqual(result, [{ id: 'card-1', idBoard: 'board-1' }]);
});

test('searchAllBoards scopes search parameters to the configured board', async () => {
  let capturedOptions;
  const client = createClient(
    createFakeAxios({
      get: async (path, options) => {
        assert.equal(path, '/search');
        capturedOptions = options;
        return { data: { boards: [], cards: [] } };
      },
    })
  );

  await client.searchAllBoards('needle', 5);

  assert.equal(capturedOptions.params.idBoards, 'board-1');
  assert.equal(capturedOptions.params.cards_limit, 5);
  assert.equal(capturedOptions.params.boards_limit, 1);
  assert.equal(capturedOptions.params.modelTypes, 'boards,cards');
});

test('handleRequest retries rate limits and preserves the final error cause', async () => {
  let attempts = 0;
  const client = createClient(
    createFakeAxios({
      get: async () => {
        attempts += 1;
        throw createAxiosError('Too many requests', 429);
      },
    })
  );

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = callback => {
    callback();
    return 0;
  };

  try {
    await assert.rejects(
      client.getLists(),
      error =>
        /rate limit exceeded/.test(error.message) &&
        error.cause &&
        error.cause.response.status === 429
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.equal(attempts, 4);
});
