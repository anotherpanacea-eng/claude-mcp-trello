import test from 'node:test';
import assert from 'node:assert/strict';

import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import {
  validateAddCardRequest,
  validateGetRecentActivityRequest,
  validateGetMyCardsRequest,
  validateObject,
  validateSearchBoardRequest,
  validateSetCustomFieldRequest,
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
  assert.deepEqual(validateGetRecentActivityRequest({ limit: 25 }), {
    boardId: undefined,
    limit: 25,
  });

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
    boardId: undefined,
    query: 'alpha',
    limit: 25,
  });

  assert.throws(
    () => validateSearchBoardRequest({ query: 'alpha', limit: 26 }),
    error => error.code === ErrorCode.InvalidParams
  );
});

test('validateGetMyCardsRequest accepts an optional boardId', () => {
  assert.deepEqual(validateGetMyCardsRequest({}), { boardId: undefined });
  assert.deepEqual(validateGetMyCardsRequest({ boardId: '507f1f77bcf86cd799439011' }), {
    boardId: '507f1f77bcf86cd799439011',
  });
});

test('validateSetCustomFieldRequest allows clearing list fields', () => {
  assert.deepEqual(
    validateSetCustomFieldRequest({
      cardId: '507f1f77bcf86cd799439011',
      customFieldId: '507f1f77bcf86cd799439012',
      type: 'list',
    }),
    {
      cardId: '507f1f77bcf86cd799439011',
      customFieldId: '507f1f77bcf86cd799439012',
      type: 'list',
      idValue: undefined,
    }
  );
});
