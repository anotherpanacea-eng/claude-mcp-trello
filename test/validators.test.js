import test from 'node:test';
import assert from 'node:assert/strict';

import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import {
  validateAddCardRequest,
  validateGetRecentActivityRequest,
  validateObject,
  validateSearchBoardRequest,
} from '../build/validators.js';

test('validateObject rejects non-object arguments', () => {
  assert.throws(
    () => validateObject('bad', 'arguments'),
    error => error.code === ErrorCode.InvalidParams
  );
});

test('validateAddCardRequest trims required strings', () => {
  const result = validateAddCardRequest({
    listId: '  507f1f77bcf86cd799439011  ',
    name: '  Example card  ',
  });

  assert.equal(result.listId, '507f1f77bcf86cd799439011');
  assert.equal(result.name, 'Example card');
});

test('validateGetRecentActivityRequest enforces bounds', () => {
  assert.deepEqual(validateGetRecentActivityRequest({ limit: 25 }), { limit: 25 });

  assert.throws(
    () => validateGetRecentActivityRequest({ limit: 0 }),
    error => error.code === ErrorCode.InvalidParams
  );

  assert.throws(
    () => validateGetRecentActivityRequest({ limit: 101 }),
    error => error.code === ErrorCode.InvalidParams
  );
});

test('validateSearchBoardRequest enforces a bounded positive limit', () => {
  assert.deepEqual(validateSearchBoardRequest({ query: 'alpha', limit: 25 }), {
    query: 'alpha',
    limit: 25,
  });

  assert.throws(
    () => validateSearchBoardRequest({ query: 'alpha', limit: 26 }),
    error => error.code === ErrorCode.InvalidParams
  );
});
