import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const MAX_ACTIVITY_LIMIT = 100;
const MAX_SEARCH_LIMIT = 25;
const TRELLO_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export function validateObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new McpError(ErrorCode.InvalidParams, `${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function validateString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, `${field} must be a string`);
  }
  return value;
}

export function validateNonEmptyString(value: unknown, field: string): string {
  const normalized = validateString(value, field).trim();
  if (!normalized) {
    throw new McpError(ErrorCode.InvalidParams, `${field} must not be empty`);
  }
  return normalized;
}

export function validateOptionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return validateString(value, 'value');
}

export function validateNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') {
    throw new McpError(ErrorCode.InvalidParams, `${field} must be a number`);
  }
  return value;
}

export function validateOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return validateNumber(value, 'value');
}

export function validateOptionalPositiveInteger(
  value: unknown,
  field: string,
  max: number
): number | undefined {
  if (value === undefined) return undefined;

  const parsed = validateNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new McpError(ErrorCode.InvalidParams, `${field} must be an integer between 1 and ${max}`);
  }

  return parsed;
}

export function validateTrelloId(value: unknown, field: string): string {
  const id = validateNonEmptyString(value, field);
  if (!TRELLO_ID_PATTERN.test(id)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${field} must be a valid Trello ID (24-character hex string)`
    );
  }
  return id;
}

export function validateOptionalTrelloIdArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const arr = validateStringArray(value);
  for (const item of arr) {
    if (!TRELLO_ID_PATTERN.test(item)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Each label ID must be a valid Trello ID (24-character hex string)`
      );
    }
  }
  return arr;
}

export function validateStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new McpError(ErrorCode.InvalidParams, 'Value must be an array of strings');
  }
  return value;
}

export function validateOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return validateStringArray(value);
}

export function validateGetCardsListRequest(args: Record<string, unknown>): { listId: string } {
  if (!args.listId) {
    throw new McpError(ErrorCode.InvalidParams, 'listId is required');
  }
  return {
    listId: validateTrelloId(args.listId, 'listId'),
  };
}

export function validateGetRecentActivityRequest(args: Record<string, unknown>): {
  limit?: number;
} {
  return {
    limit: validateOptionalPositiveInteger(args.limit, 'limit', MAX_ACTIVITY_LIMIT),
  };
}

export function validateAddCardRequest(args: Record<string, unknown>): {
  listId: string;
  name: string;
  description?: string;
  dueDate?: string;
  labels?: string[];
} {
  if (!args.listId || !args.name) {
    throw new McpError(ErrorCode.InvalidParams, 'listId and name are required');
  }
  return {
    listId: validateTrelloId(args.listId, 'listId'),
    name: validateNonEmptyString(args.name, 'name'),
    description: validateOptionalString(args.description),
    dueDate: validateOptionalString(args.dueDate),
    labels: validateOptionalTrelloIdArray(args.labels),
  };
}

export function validateUpdateCardRequest(args: Record<string, unknown>): {
  cardId: string;
  name?: string;
  description?: string;
  dueDate?: string;
  labels?: string[];
} {
  if (!args.cardId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId is required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    name: validateOptionalString(args.name),
    description: validateOptionalString(args.description),
    dueDate: validateOptionalString(args.dueDate),
    labels: validateOptionalTrelloIdArray(args.labels),
  };
}

export function validateArchiveCardRequest(args: Record<string, unknown>): { cardId: string } {
  if (!args.cardId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId is required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
  };
}

export function validateAddListRequest(args: Record<string, unknown>): { name: string } {
  if (!args.name) {
    throw new McpError(ErrorCode.InvalidParams, 'name is required');
  }
  return {
    name: validateNonEmptyString(args.name, 'name'),
  };
}

export function validateArchiveListRequest(args: Record<string, unknown>): { listId: string } {
  if (!args.listId) {
    throw new McpError(ErrorCode.InvalidParams, 'listId is required');
  }
  return {
    listId: validateTrelloId(args.listId, 'listId'),
  };
}

const VALID_LABEL_COLORS = new Set([
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
]);

export function validateMoveCardRequest(args: Record<string, unknown>): {
  cardId: string;
  listId: string;
} {
  if (!args.cardId || !args.listId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and listId are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    listId: validateTrelloId(args.listId, 'listId'),
  };
}

export function validateAddCommentRequest(args: Record<string, unknown>): {
  cardId: string;
  text: string;
} {
  if (!args.cardId || !args.text) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and text are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    text: validateNonEmptyString(args.text, 'text'),
  };
}

export function validateAddLabelRequest(args: Record<string, unknown>): {
  name: string;
  color: string;
} {
  if (!args.name || !args.color) {
    throw new McpError(ErrorCode.InvalidParams, 'name and color are required');
  }
  const color = validateNonEmptyString(args.color, 'color');
  if (!VALID_LABEL_COLORS.has(color)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `color must be one of: ${[...VALID_LABEL_COLORS].join(', ')}`
    );
  }
  return {
    name: validateNonEmptyString(args.name, 'name'),
    color,
  };
}

export function validateGetChecklistsRequest(args: Record<string, unknown>): {
  cardId: string;
} {
  if (!args.cardId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId is required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
  };
}

export function validateCreateChecklistRequest(args: Record<string, unknown>): {
  cardId: string;
  name: string;
} {
  if (!args.cardId || !args.name) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and name are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    name: validateNonEmptyString(args.name, 'name'),
  };
}

export function validateAddCheckItemRequest(args: Record<string, unknown>): {
  checklistId: string;
  name: string;
} {
  if (!args.checklistId || !args.name) {
    throw new McpError(ErrorCode.InvalidParams, 'checklistId and name are required');
  }
  return {
    checklistId: validateTrelloId(args.checklistId, 'checklistId'),
    name: validateNonEmptyString(args.name, 'name'),
  };
}

export function validateUpdateCheckItemRequest(args: Record<string, unknown>): {
  cardId: string;
  checkItemId: string;
  name?: string;
  state?: string;
} {
  if (!args.cardId || !args.checkItemId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and checkItemId are required');
  }
  const state = validateOptionalString(args.state);
  if (state !== undefined && state !== 'complete' && state !== 'incomplete') {
    throw new McpError(ErrorCode.InvalidParams, 'state must be "complete" or "incomplete"');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    checkItemId: validateTrelloId(args.checkItemId, 'checkItemId'),
    name: validateOptionalString(args.name),
    state,
  };
}

export function validateDeleteCheckItemRequest(args: Record<string, unknown>): {
  checklistId: string;
  checkItemId: string;
} {
  if (!args.checklistId || !args.checkItemId) {
    throw new McpError(ErrorCode.InvalidParams, 'checklistId and checkItemId are required');
  }
  return {
    checklistId: validateTrelloId(args.checklistId, 'checklistId'),
    checkItemId: validateTrelloId(args.checkItemId, 'checkItemId'),
  };
}

export function validateGetCustomFieldItemsRequest(args: Record<string, unknown>): {
  cardId: string;
} {
  if (!args.cardId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId is required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
  };
}

const VALID_CUSTOM_FIELD_TYPES = new Set(['text', 'number', 'checkbox', 'date', 'list']);

export function validateSetCustomFieldRequest(args: Record<string, unknown>): {
  cardId: string;
  customFieldId: string;
  type: string;
  value?: string;
  idValue?: string;
} {
  if (!args.cardId || !args.customFieldId || !args.type) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId, customFieldId, and type are required');
  }
  const type = validateNonEmptyString(args.type, 'type');
  if (!VALID_CUSTOM_FIELD_TYPES.has(type)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `type must be one of: ${[...VALID_CUSTOM_FIELD_TYPES].join(', ')}`
    );
  }
  if (type === 'list') {
    if (!args.idValue) {
      throw new McpError(ErrorCode.InvalidParams, 'idValue is required for list-type fields');
    }
    return {
      cardId: validateTrelloId(args.cardId, 'cardId'),
      customFieldId: validateTrelloId(args.customFieldId, 'customFieldId'),
      type,
      idValue: validateTrelloId(args.idValue, 'idValue'),
    };
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    customFieldId: validateTrelloId(args.customFieldId, 'customFieldId'),
    type,
    value: validateOptionalString(args.value),
  };
}

export function validateGetCardAttachmentsRequest(args: Record<string, unknown>): {
  cardId: string;
} {
  if (!args.cardId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId is required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
  };
}

export function validateDownloadAttachmentRequest(args: Record<string, unknown>): {
  cardId: string;
  attachmentId: string;
} {
  if (!args.cardId || !args.attachmentId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and attachmentId are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    attachmentId: validateTrelloId(args.attachmentId, 'attachmentId'),
  };
}

export function validateSearchBoardRequest(args: Record<string, unknown>): {
  query: string;
  limit?: number;
} {
  if (!args.query) {
    throw new McpError(ErrorCode.InvalidParams, 'query is required');
  }

  return {
    query: validateNonEmptyString(args.query, 'query'),
    limit: validateOptionalPositiveInteger(args.limit, 'limit', MAX_SEARCH_LIMIT),
  };
}

export function validateAssignCardMemberRequest(args: Record<string, unknown>): {
  cardId: string;
  memberId: string;
} {
  if (!args.cardId || !args.memberId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and memberId are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    memberId: validateTrelloId(args.memberId, 'memberId'),
  };
}

export function validateUnassignCardMemberRequest(args: Record<string, unknown>): {
  cardId: string;
  memberId: string;
} {
  if (!args.cardId || !args.memberId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and memberId are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    memberId: validateTrelloId(args.memberId, 'memberId'),
  };
}

export function validateDeleteCommentRequest(args: Record<string, unknown>): {
  cardId: string;
  actionId: string;
} {
  if (!args.cardId || !args.actionId) {
    throw new McpError(ErrorCode.InvalidParams, 'cardId and actionId are required');
  }
  return {
    cardId: validateTrelloId(args.cardId, 'cardId'),
    actionId: validateTrelloId(args.actionId, 'actionId'),
  };
}
