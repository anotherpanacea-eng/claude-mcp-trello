import test from 'node:test';
import assert from 'node:assert/strict';

import { TrelloClient } from '../build/trello-client.js';
import { createAxiosError, createFakeAxios } from './helpers.js';

const PRIMARY_BOARD_ID = '507f1f77bcf86cd799439011';
const SECONDARY_BOARD_ID = '507f1f77bcf86cd799439012';
const FOREIGN_BOARD_ID = '507f1f77bcf86cd799439013';

function createClient(fakeAxios, configOverrides = {}) {
  const client = new TrelloClient({
    apiKey: 'key',
    token: 'token',
    boardId: PRIMARY_BOARD_ID,
    allowedBoardIds: [PRIMARY_BOARD_ID],
    ...configOverrides,
  });

  client.axiosInstance = fakeAxios;
  client.rateLimiter = {
    waitForAvailable: async () => {},
  };

  return client;
}

test('getCardsByList rejects lists outside the allowed board scope', async () => {
  const client = createClient(
    createFakeAxios({
      get: async path => {
        if (path === '/lists/list-1/board') {
          return { data: { id: FOREIGN_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
    })
  );

  await assert.rejects(client.getCardsByList('list-1'), /outside the allowed board scope/);
});

test('getCardsByList fetches cards after board-scope validation', async () => {
  const calls = [];
  const cards = [
    {
      id: 'card-1',
      name: 'Card',
      idList: 'list-1',
      idLabels: [],
      closed: false,
      url: '',
      dateLastActivity: '',
      desc: '',
      due: null,
    },
  ];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(path);

        if (path === '/lists/list-1/board') {
          return { data: { id: PRIMARY_BOARD_ID } };
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

test('getAllowedBoards returns metadata for each allowed board', async () => {
  const client = createClient(
    createFakeAxios({
      get: async path => {
        if (path === `/boards/${PRIMARY_BOARD_ID}`) {
          return { data: { id: PRIMARY_BOARD_ID, name: 'Primary', url: 'https://trello.com/b/1' } };
        }

        if (path === `/boards/${SECONDARY_BOARD_ID}`) {
          return {
            data: { id: SECONDARY_BOARD_ID, name: 'Secondary', url: 'https://trello.com/b/2' },
          };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
    }),
    { allowedBoardIds: [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID] }
  );

  const result = await client.getAllowedBoards();

  assert.deepEqual(result, [
    { id: PRIMARY_BOARD_ID, name: 'Primary', url: 'https://trello.com/b/1' },
    { id: SECONDARY_BOARD_ID, name: 'Secondary', url: 'https://trello.com/b/2' },
  ]);
});

test('getLists allows explicitly targeting a secondary allowed board', async () => {
  let requestedPath;
  const client = createClient(
    createFakeAxios({
      get: async path => {
        requestedPath = path;
        return { data: [{ id: 'list-2', idBoard: SECONDARY_BOARD_ID }] };
      },
    }),
    { allowedBoardIds: [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID] }
  );

  const result = await client.getLists(SECONDARY_BOARD_ID);

  assert.equal(requestedPath, `/boards/${SECONDARY_BOARD_ID}/lists`);
  assert.deepEqual(result, [{ id: 'list-2', idBoard: SECONDARY_BOARD_ID }]);
});

test('getMyCards filters cards down to the allowed board set', async () => {
  const client = createClient(
    createFakeAxios({
      get: async path => {
        assert.equal(path, '/members/me/cards');
        return {
          data: [
            { id: 'card-1', idBoard: PRIMARY_BOARD_ID },
            { id: 'card-2', idBoard: SECONDARY_BOARD_ID },
            { id: 'card-3', idBoard: FOREIGN_BOARD_ID },
          ],
        };
      },
    }),
    { allowedBoardIds: [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID] }
  );

  const result = await client.getMyCards();

  assert.deepEqual(result, [
    { id: 'card-1', idBoard: PRIMARY_BOARD_ID },
    { id: 'card-2', idBoard: SECONDARY_BOARD_ID },
  ]);
});

test('searchAllBoards aggregates across allowed boards and sorts by recent activity', async () => {
  const requestedBoards = [];
  const client = createClient(
    createFakeAxios({
      get: async (path, options) => {
        assert.equal(path, '/search');
        requestedBoards.push(options.params.idBoards);

        if (options.params.idBoards === PRIMARY_BOARD_ID) {
          return {
            data: {
              boards: [{ id: PRIMARY_BOARD_ID, name: 'Primary', url: 'https://trello.com/b/1' }],
              cards: [{ id: 'card-1', idBoard: PRIMARY_BOARD_ID, dateLastActivity: '2024-01-01T00:00:00Z' }],
            },
          };
        }

        if (options.params.idBoards === SECONDARY_BOARD_ID) {
          return {
            data: {
              boards: [
                { id: SECONDARY_BOARD_ID, name: 'Secondary', url: 'https://trello.com/b/2' },
              ],
              cards: [{ id: 'card-2', idBoard: SECONDARY_BOARD_ID, dateLastActivity: '2024-02-01T00:00:00Z' }],
            },
          };
        }

        throw new Error(`Unexpected board search: ${options.params.idBoards}`);
      },
    }),
    { allowedBoardIds: [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID] }
  );

  const result = await client.searchAllBoards('needle', 5);

  assert.deepEqual(requestedBoards, [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID]);
  assert.deepEqual(
    result.boards.map(board => board.id),
    [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID]
  );
  assert.deepEqual(
    result.cards.map(card => card.id),
    ['card-2', 'card-1']
  );
});

test('searchAllBoards scopes search parameters to a selected allowed board', async () => {
  let capturedOptions;
  const client = createClient(
    createFakeAxios({
      get: async (path, options) => {
        assert.equal(path, '/search');
        capturedOptions = options;
        return { data: { boards: [], cards: [] } };
      },
    }),
    { allowedBoardIds: [PRIMARY_BOARD_ID, SECONDARY_BOARD_ID] }
  );

  await client.searchAllBoards('needle', 5, SECONDARY_BOARD_ID);

  assert.equal(capturedOptions.params.idBoards, SECONDARY_BOARD_ID);
  assert.equal(capturedOptions.params.cards_limit, 5);
  assert.equal(capturedOptions.params.boards_limit, 1);
  assert.equal(capturedOptions.params.modelTypes, 'boards,cards');
});

test('addCheckItem rejects checklists outside the allowed board scope', async () => {
  const client = createClient(
    createFakeAxios({
      get: async path => {
        if (path === '/checklists/checklist-1') {
          return { data: { idBoard: FOREIGN_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
    })
  );

  await assert.rejects(client.addCheckItem('checklist-1', 'Write docs'), /outside the allowed board scope/);
});

test('addCheckItem validates checklist scope before posting', async () => {
  const calls = [];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(`GET ${path}`);

        if (path === '/checklists/checklist-1') {
          return { data: { idBoard: PRIMARY_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
      post: async (path, body) => {
        calls.push(`POST ${path}`);
        assert.deepEqual(body, { name: 'Write docs' });
        return { data: { id: 'item-1', name: 'Write docs', idChecklist: 'checklist-1' } };
      },
    })
  );

  const result = await client.addCheckItem('checklist-1', 'Write docs');

  assert.equal(result.id, 'item-1');
  assert.deepEqual(calls, [
    'GET /checklists/checklist-1',
    'POST /checklists/checklist-1/checkItems',
  ]);
});

test('deleteCheckItem validates checklist scope before deleting', async () => {
  const calls = [];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(`GET ${path}`);

        if (path === '/checklists/checklist-1') {
          return { data: { idBoard: PRIMARY_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
      delete: async path => {
        calls.push(`DELETE ${path}`);
      },
    })
  );

  await client.deleteCheckItem('checklist-1', 'item-1');

  assert.deepEqual(calls, [
    'GET /checklists/checklist-1',
    'DELETE /checklists/checklist-1/checkItems/item-1',
  ]);
});

test('setCustomFieldValue validates card scope before updating', async () => {
  const calls = [];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(`GET ${path}`);

        if (path === '/cards/card-1') {
          return { data: { idBoard: PRIMARY_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
      put: async (path, body) => {
        calls.push(`PUT ${path}`);
        assert.deepEqual(body, { value: { text: 'High' } });
        return { data: { id: 'cf-item-1' } };
      },
    })
  );

  const result = await client.setCustomFieldValue('card-1', 'field-1', {
    value: { text: 'High' },
  });

  assert.equal(result.id, 'cf-item-1');
  assert.deepEqual(calls, [
    'GET /cards/card-1',
    'PUT /card/card-1/customField/field-1/item',
  ]);
});

test('assignCardMember validates card scope before posting', async () => {
  const calls = [];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(`GET ${path}`);

        if (path === '/cards/card-1') {
          return { data: { idBoard: PRIMARY_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
      post: async (path, body) => {
        calls.push(`POST ${path}`);
        assert.deepEqual(body, { value: 'member-1' });
        return { data: [{ id: 'member-1' }] };
      },
    })
  );

  const result = await client.assignCardMember('card-1', 'member-1');

  assert.deepEqual(result, [{ id: 'member-1' }]);
  assert.deepEqual(calls, ['GET /cards/card-1', 'POST /cards/card-1/idMembers']);
});

test('deleteComment validates card scope before deleting', async () => {
  const calls = [];
  const client = createClient(
    createFakeAxios({
      get: async path => {
        calls.push(`GET ${path}`);

        if (path === '/cards/card-1') {
          return { data: { idBoard: PRIMARY_BOARD_ID } };
        }

        throw new Error(`Unexpected path: ${path}`);
      },
      delete: async path => {
        calls.push(`DELETE ${path}`);
      },
    })
  );

  await client.deleteComment('card-1', 'action-1');

  assert.deepEqual(calls, [
    'GET /cards/card-1',
    'DELETE /cards/card-1/actions/action-1/comments',
  ]);
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
