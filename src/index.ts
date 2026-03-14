#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { TrelloClient } from './trello-client.js';
import {
  validateAddCardRequest,
  validateAddCheckItemRequest,
  validateAddCommentRequest,
  validateAddLabelRequest,
  validateAddListRequest,
  validateArchiveCardRequest,
  validateArchiveListRequest,
  validateAssignCardMemberRequest,
  validateCreateChecklistRequest,
  validateDeleteCheckItemRequest,
  validateDeleteCommentRequest,
  validateDownloadAttachmentRequest,
  validateGetCardAttachmentsRequest,
  validateGetCardsListRequest,
  validateGetCustomFieldItemsRequest,
  validateGetMyCardsRequest,
  validateSetCustomFieldRequest,
  validateGetChecklistsRequest,
  validateGetRecentActivityRequest,
  validateMoveCardRequest,
  validateObject,
  validateOptionalBoardTargetRequest,
  validateSearchBoardRequest,
  validateTrelloId,
  validateUnassignCardMemberRequest,
  validateUpdateCardRequest,
  validateUpdateCheckItemRequest,
} from './validators.js';

const DEFAULT_ACTIVITY_LIMIT = 10;
const DEFAULT_SEARCH_LIMIT = 10;

const WRITE_TOOLS = new Set([
  'trello_add_card',
  'trello_update_card',
  'trello_archive_card',
  'trello_add_list',
  'trello_archive_list',
  'trello_move_card',
  'trello_add_comment',
  'trello_add_label',
  'trello_create_checklist',
  'trello_add_check_item',
  'trello_update_check_item',
  'trello_delete_check_item',
  'trello_set_custom_field',
  'trello_assign_card_member',
  'trello_unassign_card_member',
  'trello_delete_comment',
]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function auditLog(toolName: string, args: Record<string, unknown>): void {
  const idFields: Record<string, unknown> = {};
  for (const key of [
    'listId',
    'cardId',
    'boardId',
    'checklistId',
    'memberId',
    'actionId',
    'customFieldId',
    'attachmentId',
  ]) {
    if (args[key] !== undefined) idFields[key] = args[key];
  }
  const idSummary = Object.keys(idFields).length > 0 ? ` ${JSON.stringify(idFields)}` : '';
  console.error(`[audit] ${new Date().toISOString()} ${toolName}${idSummary}`);
}

const optionalBoardIdProperty = {
  boardId: {
    type: 'string',
    description:
      'Optional board ID. Omit to use the primary configured board. Must be one of the allowed boards when multi-board mode is enabled.',
  },
} as const;

function parseAllowedBoardIds(primaryBoardId: string, rawValue: string | undefined): string[] {
  const allowedBoardIds = new Set([primaryBoardId]);

  if (!rawValue) {
    return [...allowedBoardIds];
  }

  for (const candidate of rawValue.split(',')) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }

    validateTrelloId(trimmed, 'TRELLO_ALLOWED_BOARD_IDS');
    allowedBoardIds.add(trimmed);
  }

  return [...allowedBoardIds];
}

// --------------------------------------------------
// Define tools for Trello (Tool)
// --------------------------------------------------
const trelloGetCardsByListTool: Tool = {
  name: 'trello_get_cards_by_list',
  description: 'Retrieves a list of cards contained in the specified list ID.',
  inputSchema: {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Trello list ID',
      },
    },
    required: ['listId'],
  },
  annotations: {
    title: 'Get Cards by List',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetAllowedBoardsTool: Tool = {
  name: 'trello_get_allowed_boards',
  description:
    'Lists the boards this MCP server is allowed to access. Use this first in allowed-boards mode to choose a board ID for board-level tools.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  annotations: {
    title: 'Get Allowed Boards',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetListsTool: Tool = {
  name: 'trello_get_lists',
  description:
    'Retrieves all lists in a board. Defaults to the primary configured board unless boardId is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
    },
  },
  annotations: {
    title: 'Get Board Lists',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetRecentActivityTool: Tool = {
  name: 'trello_get_recent_activity',
  description:
    "Retrieves recent activity for a board. Defaults to the primary configured board unless boardId is provided. The 'limit' argument can specify how many to retrieve.",
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
      limit: {
        type: 'number',
        description: 'Number of activities to retrieve (default: 10)',
      },
    },
  },
  annotations: {
    title: 'Get Recent Activity',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloAddCardTool: Tool = {
  name: 'trello_add_card',
  description: 'Adds a card to the specified list.',
  inputSchema: {
    type: 'object',
    properties: {
      listId: { type: 'string', description: 'The ID of the list to add to' },
      name: { type: 'string', description: 'The title of the card' },
      description: {
        type: 'string',
        description: 'Details of the card (optional)',
      },
      dueDate: {
        type: 'string',
        description: 'Due date (can be specified in ISO8601 format, etc. Optional)',
      },
      labels: {
        type: 'array',
        description: 'Array of label IDs (optional)',
        items: { type: 'string' },
      },
    },
    required: ['listId', 'name'],
  },
  annotations: {
    title: 'Add Card',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const trelloUpdateCardTool: Tool = {
  name: 'trello_update_card',
  description: 'Updates the content of a card.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to be updated',
      },
      name: {
        type: 'string',
        description: 'The title of the card (optional)',
      },
      description: {
        type: 'string',
        description: 'Details of the card (optional)',
      },
      dueDate: {
        type: 'string',
        description: 'Due date (can be specified in ISO8601 format, etc. Optional)',
      },
      labels: {
        type: 'array',
        description: 'An array of label IDs (optional)',
        items: { type: 'string' },
      },
    },
    required: ['cardId'],
  },
  annotations: {
    title: 'Update Card',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloArchiveCardTool: Tool = {
  name: 'trello_archive_card',
  description: 'Archives (closes) the specified card.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to archive',
      },
    },
    required: ['cardId'],
  },
  annotations: {
    title: 'Archive Card',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloAddListTool: Tool = {
  name: 'trello_add_list',
  description:
    'Adds a new list to a board. Defaults to the primary configured board unless boardId is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
      name: {
        type: 'string',
        description: 'Name of the list',
      },
    },
    required: ['name'],
  },
  annotations: {
    title: 'Add List',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const trelloArchiveListTool: Tool = {
  name: 'trello_archive_list',
  description: 'Archives (closes) the specified list.',
  inputSchema: {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'The ID of the list to archive',
      },
    },
    required: ['listId'],
  },
  annotations: {
    title: 'Archive List',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetMyCardsTool: Tool = {
  name: 'trello_get_my_cards',
  description:
    'Retrieves cards related to your account within the allowed board scope. Provide boardId to limit results to a single board.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
    },
  },
  annotations: {
    title: 'Get My Cards',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloSearchAllBoardsTool: Tool = {
  name: 'trello_search_all_boards',
  description:
    'Searches within the allowed board scope. Provide boardId to search a single board, or omit it to search all allowed boards.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
      query: { type: 'string', description: 'Search keyword' },
      limit: {
        type: 'number',
        description: 'Maximum number of results to retrieve (default: 10)',
      },
    },
    required: ['query'],
  },
  annotations: {
    title: 'Search Board',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloMoveCardTool: Tool = {
  name: 'trello_move_card',
  description: 'Moves a card to a different list.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to move',
      },
      listId: {
        type: 'string',
        description: 'The ID of the destination list',
      },
    },
    required: ['cardId', 'listId'],
  },
  annotations: {
    title: 'Move Card',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloAddCommentTool: Tool = {
  name: 'trello_add_comment',
  description: 'Adds a comment to a card.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to comment on',
      },
      text: {
        type: 'string',
        description: 'The comment text',
      },
    },
    required: ['cardId', 'text'],
  },
  annotations: {
    title: 'Add Comment',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const trelloGetLabelsTool: Tool = {
  name: 'trello_get_labels',
  description:
    'Retrieves all labels on a board. Defaults to the primary configured board unless boardId is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
    },
  },
  annotations: {
    title: 'Get Labels',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloAddLabelTool: Tool = {
  name: 'trello_add_label',
  description:
    'Creates a new label on a board. Defaults to the primary configured board unless boardId is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
      name: {
        type: 'string',
        description: 'The name of the label',
      },
      color: {
        type: 'string',
        description:
          'The color of the label (green, yellow, orange, red, purple, blue, sky, lime, pink, black)',
      },
    },
    required: ['name', 'color'],
  },
  annotations: {
    title: 'Add Label',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const trelloGetChecklistsTool: Tool = {
  name: 'trello_get_checklists',
  description: 'Retrieves all checklists on a card, including their items and completion states.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to get checklists from',
      },
    },
    required: ['cardId'],
  },
  annotations: {
    title: 'Get Checklists',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloCreateChecklistTool: Tool = {
  name: 'trello_create_checklist',
  description: 'Creates a new checklist on a card.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to add the checklist to',
      },
      name: {
        type: 'string',
        description: 'The name of the checklist',
      },
    },
    required: ['cardId', 'name'],
  },
  annotations: {
    title: 'Create Checklist',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const trelloAddCheckItemTool: Tool = {
  name: 'trello_add_check_item',
  description: 'Adds an item to a checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      checklistId: {
        type: 'string',
        description: 'The ID of the checklist to add the item to',
      },
      name: {
        type: 'string',
        description: 'The text of the checklist item',
      },
    },
    required: ['checklistId', 'name'],
  },
  annotations: {
    title: 'Add Checklist Item',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const trelloUpdateCheckItemTool: Tool = {
  name: 'trello_update_check_item',
  description: 'Updates a checklist item — change its name, or mark it as complete/incomplete.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card containing the checklist item',
      },
      checkItemId: {
        type: 'string',
        description: 'The ID of the checklist item to update',
      },
      name: {
        type: 'string',
        description: 'New name for the item (optional)',
      },
      state: {
        type: 'string',
        description: 'New state: "complete" or "incomplete" (optional)',
      },
    },
    required: ['cardId', 'checkItemId'],
  },
  annotations: {
    title: 'Update Checklist Item',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloDeleteCheckItemTool: Tool = {
  name: 'trello_delete_check_item',
  description: 'Deletes an item from a checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      checklistId: {
        type: 'string',
        description: 'The ID of the checklist containing the item',
      },
      checkItemId: {
        type: 'string',
        description: 'The ID of the checklist item to delete',
      },
    },
    required: ['checklistId', 'checkItemId'],
  },
  annotations: {
    title: 'Delete Checklist Item',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetCustomFieldsTool: Tool = {
  name: 'trello_get_custom_fields',
  description:
    'Retrieves all custom field definitions on a board, including dropdown options. Defaults to the primary configured board unless boardId is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
    },
  },
  annotations: {
    title: 'Get Custom Fields',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetCustomFieldItemsTool: Tool = {
  name: 'trello_get_custom_field_items',
  description:
    'Retrieves all custom field values set on a card. Use trello_get_custom_fields first to understand the field definitions and types.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to get custom field values from',
      },
    },
    required: ['cardId'],
  },
  annotations: {
    title: 'Get Custom Field Values',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloSetCustomFieldTool: Tool = {
  name: 'trello_set_custom_field',
  description:
    'Sets a custom field value on a card. For text/number/date/checkbox fields, provide "value". For list/dropdown fields, provide "idValue" (the option ID from field definitions). To clear a value, omit value/idValue.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card',
      },
      customFieldId: {
        type: 'string',
        description: 'The ID of the custom field definition',
      },
      type: {
        type: 'string',
        description: 'The field type: "text", "number", "checkbox", "date", or "list"',
      },
      value: {
        type: 'string',
        description:
          'The value to set (for text: string, number: "42", date: ISO 8601, checkbox: "true"/"false"). Omit to clear.',
      },
      idValue: {
        type: 'string',
        description: 'The option ID for list/dropdown fields. Omit to clear.',
      },
    },
    required: ['cardId', 'customFieldId', 'type'],
  },
  annotations: {
    title: 'Set Custom Field',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetCardAttachmentsTool: Tool = {
  name: 'trello_get_card_attachments',
  description:
    'Retrieves all attachments from a card. Returns metadata including name, file size, MIME type, and URL.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card to get attachments from',
      },
    },
    required: ['cardId'],
  },
  annotations: {
    title: 'Get Card Attachments',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloDownloadAttachmentTool: Tool = {
  name: 'trello_download_attachment',
  description:
    'Downloads a specific attachment from a card. Returns base64-encoded content for Trello uploads, or the URL for external links. Use trello_get_card_attachments first to get the attachment ID.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card containing the attachment',
      },
      attachmentId: {
        type: 'string',
        description: 'The ID of the attachment to download',
      },
    },
    required: ['cardId', 'attachmentId'],
  },
  annotations: {
    title: 'Download Attachment',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloGetBoardMembersTool: Tool = {
  name: 'trello_get_board_members',
  description:
    'Retrieves all members of a board. Use to find member IDs for card assignment. Defaults to the primary configured board unless boardId is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      ...optionalBoardIdProperty,
    },
  },
  annotations: {
    title: 'Get Board Members',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloAssignCardMemberTool: Tool = {
  name: 'trello_assign_card_member',
  description: 'Assigns a member to a card. Use trello_get_board_members to find the member ID.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card',
      },
      memberId: {
        type: 'string',
        description: 'The ID of the member to assign',
      },
    },
    required: ['cardId', 'memberId'],
  },
  annotations: {
    title: 'Assign Card Member',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloUnassignCardMemberTool: Tool = {
  name: 'trello_unassign_card_member',
  description: 'Removes a member from a card.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card',
      },
      memberId: {
        type: 'string',
        description: 'The ID of the member to remove',
      },
    },
    required: ['cardId', 'memberId'],
  },
  annotations: {
    title: 'Unassign Card Member',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const trelloDeleteCommentTool: Tool = {
  name: 'trello_delete_comment',
  description:
    'Deletes a comment from a card. The actionId is the ID of the comment action, obtainable from trello_get_recent_activity.',
  inputSchema: {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The ID of the card containing the comment',
      },
      actionId: {
        type: 'string',
        description: 'The ID of the comment action to delete',
      },
    },
    required: ['cardId', 'actionId'],
  },
  annotations: {
    title: 'Delete Comment',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

// --------------------------------------------------
// Main server implementation
// --------------------------------------------------
async function main() {
  const trelloApiKey = process.env.TRELLO_API_KEY;
  const trelloToken = process.env.TRELLO_TOKEN;
  const trelloBoardId = process.env.TRELLO_BOARD_ID;
  const trelloAllowedBoardIdsRaw = process.env.TRELLO_ALLOWED_BOARD_IDS;

  if (!trelloApiKey || !trelloToken || !trelloBoardId) {
    console.error('TRELLO_API_KEY / TRELLO_TOKEN / TRELLO_BOARD_ID are not set.');
    process.exit(1);
  }

  try {
    validateTrelloId(trelloBoardId, 'TRELLO_BOARD_ID');
  } catch {
    console.error('TRELLO_BOARD_ID must be a valid 24-character hex Trello ID.');
    process.exit(1);
  }

  let allowedBoardIds: string[];
  try {
    allowedBoardIds = parseAllowedBoardIds(trelloBoardId, trelloAllowedBoardIdsRaw);
  } catch {
    console.error(
      'TRELLO_ALLOWED_BOARD_IDS must be a comma-separated list of valid 24-character hex Trello IDs.'
    );
    process.exit(1);
  }

  const readOnly = process.env.TRELLO_READ_ONLY === 'true';
  const multiBoardMode = allowedBoardIds.length > 1;

  console.error(
    `Starting Trello MCP Server...${readOnly ? ' (read-only mode)' : ''}${multiBoardMode ? ` (${allowedBoardIds.length} allowed boards)` : ''}`
  );

  // Initialize MCP Server
  const server = new Server(
    {
      name: 'Trello MCP Server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Create Trello client
  const trelloClient = new TrelloClient({
    apiKey: trelloApiKey,
    token: trelloToken,
    boardId: trelloBoardId,
    allowedBoardIds,
  });

  // --------------------------------------------------
  // Handle CallToolRequest
  // --------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    try {
      const args = validateObject(request.params.arguments, 'arguments');
      const toolName = request.params.name;

      auditLog(toolName, args);

      if (readOnly && WRITE_TOOLS.has(toolName)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Tool "${toolName}" is disabled in read-only mode. Set TRELLO_READ_ONLY=false to enable write operations.`,
              }),
            },
          ],
        };
      }

      switch (request.params.name) {
        case 'trello_get_allowed_boards': {
          const response = await trelloClient.getAllowedBoards();
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Retrieve the list of cards by specifying the listId
        // --------------------------------------------------
        case 'trello_get_cards_by_list': {
          const parsedArgs = validateGetCardsListRequest(args);
          const response = await trelloClient.getCardsByList(parsedArgs.listId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Retrieve all lists in the board
        // --------------------------------------------------
        case 'trello_get_lists': {
          const parsedArgs = validateOptionalBoardTargetRequest(args);
          const response = await trelloClient.getLists(parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Recent activity on the board
        // --------------------------------------------------
        case 'trello_get_recent_activity': {
          const parsedArgs = validateGetRecentActivityRequest(args);
          const limit = parsedArgs.limit ?? DEFAULT_ACTIVITY_LIMIT;
          const response = await trelloClient.getRecentActivity(limit, parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Create a new card
        // --------------------------------------------------
        case 'trello_add_card': {
          const parsedArgs = validateAddCardRequest(args);
          const response = await trelloClient.addCard(parsedArgs);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Update card
        // --------------------------------------------------
        case 'trello_update_card': {
          const parsedArgs = validateUpdateCardRequest(args);
          const response = await trelloClient.updateCard(parsedArgs);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Archive card
        // --------------------------------------------------
        case 'trello_archive_card': {
          const parsedArgs = validateArchiveCardRequest(args);
          const response = await trelloClient.archiveCard(parsedArgs.cardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Create a new list
        // --------------------------------------------------
        case 'trello_add_list': {
          const parsedArgs = validateAddListRequest(args);
          const response = await trelloClient.addList(parsedArgs.name, parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Archive list
        // --------------------------------------------------
        case 'trello_archive_list': {
          const parsedArgs = validateArchiveListRequest(args);
          const response = await trelloClient.archiveList(parsedArgs.listId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Retrieve all cards related to yourself
        // --------------------------------------------------
        case 'trello_get_my_cards': {
          const parsedArgs = validateGetMyCardsRequest(args);
          const response = await trelloClient.getMyCards(parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        case 'trello_search_all_boards': {
          const parsedArgs = validateSearchBoardRequest(args);
          const limit = parsedArgs.limit ?? DEFAULT_SEARCH_LIMIT;
          const response = await trelloClient.searchAllBoards(
            parsedArgs.query,
            limit,
            parsedArgs.boardId
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Move card to another list
        // --------------------------------------------------
        case 'trello_move_card': {
          const parsedArgs = validateMoveCardRequest(args);
          const response = await trelloClient.moveCard(parsedArgs.cardId, parsedArgs.listId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Add comment to card
        // --------------------------------------------------
        case 'trello_add_comment': {
          const parsedArgs = validateAddCommentRequest(args);
          const response = await trelloClient.addComment(parsedArgs.cardId, parsedArgs.text);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Get all labels on the board
        // --------------------------------------------------
        case 'trello_get_labels': {
          const parsedArgs = validateOptionalBoardTargetRequest(args);
          const response = await trelloClient.getLabels(parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Create a new label on the board
        // --------------------------------------------------
        case 'trello_add_label': {
          const parsedArgs = validateAddLabelRequest(args);
          const response = await trelloClient.addLabel(
            parsedArgs.name,
            parsedArgs.color,
            parsedArgs.boardId
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Get checklists on a card
        // --------------------------------------------------
        case 'trello_get_checklists': {
          const parsedArgs = validateGetChecklistsRequest(args);
          const response = await trelloClient.getChecklists(parsedArgs.cardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Create a checklist on a card
        // --------------------------------------------------
        case 'trello_create_checklist': {
          const parsedArgs = validateCreateChecklistRequest(args);
          const response = await trelloClient.createChecklist(parsedArgs.cardId, parsedArgs.name);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Add an item to a checklist
        // --------------------------------------------------
        case 'trello_add_check_item': {
          const parsedArgs = validateAddCheckItemRequest(args);
          const response = await trelloClient.addCheckItem(parsedArgs.checklistId, parsedArgs.name);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Update a checklist item (name or state)
        // --------------------------------------------------
        case 'trello_update_check_item': {
          const parsedArgs = validateUpdateCheckItemRequest(args);
          const response = await trelloClient.updateCheckItem(
            parsedArgs.cardId,
            parsedArgs.checkItemId,
            { name: parsedArgs.name, state: parsedArgs.state }
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Delete a checklist item
        // --------------------------------------------------
        case 'trello_delete_check_item': {
          const parsedArgs = validateDeleteCheckItemRequest(args);
          await trelloClient.deleteCheckItem(parsedArgs.checklistId, parsedArgs.checkItemId);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
          };
        }

        // --------------------------------------------------
        // Get custom field definitions
        // --------------------------------------------------
        case 'trello_get_custom_fields': {
          const parsedArgs = validateOptionalBoardTargetRequest(args);
          const response = await trelloClient.getCustomFields(parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Get custom field values on a card
        // --------------------------------------------------
        case 'trello_get_custom_field_items': {
          const parsedArgs = validateGetCustomFieldItemsRequest(args);
          const response = await trelloClient.getCustomFieldItems(parsedArgs.cardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Set a custom field value on a card
        // --------------------------------------------------
        case 'trello_set_custom_field': {
          const parsedArgs = validateSetCustomFieldRequest(args);
          let body: Record<string, unknown>;
          if (parsedArgs.type === 'list') {
            body = { idValue: parsedArgs.idValue ?? '' };
          } else if (parsedArgs.value === undefined) {
            body = { value: '', idValue: '' };
          } else {
            const valueKey = parsedArgs.type === 'checkbox' ? 'checked' : parsedArgs.type;
            body = { value: { [valueKey]: parsedArgs.value } };
          }
          const response = await trelloClient.setCustomFieldValue(
            parsedArgs.cardId,
            parsedArgs.customFieldId,
            body
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Get all attachments from a card
        // --------------------------------------------------
        case 'trello_get_card_attachments': {
          const parsedArgs = validateGetCardAttachmentsRequest(args);
          const response = await trelloClient.getCardAttachments(parsedArgs.cardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Download a specific attachment from a card
        // --------------------------------------------------
        case 'trello_download_attachment': {
          const parsedArgs = validateDownloadAttachmentRequest(args);
          const response = await trelloClient.downloadAttachment(
            parsedArgs.cardId,
            parsedArgs.attachmentId
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Get board members
        // --------------------------------------------------
        case 'trello_get_board_members': {
          const parsedArgs = validateOptionalBoardTargetRequest(args);
          const response = await trelloClient.getBoardMembers(parsedArgs.boardId);
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Assign a member to a card
        // --------------------------------------------------
        case 'trello_assign_card_member': {
          const parsedArgs = validateAssignCardMemberRequest(args);
          const response = await trelloClient.assignCardMember(
            parsedArgs.cardId,
            parsedArgs.memberId
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Unassign a member from a card
        // --------------------------------------------------
        case 'trello_unassign_card_member': {
          const parsedArgs = validateUnassignCardMemberRequest(args);
          await trelloClient.unassignCardMember(parsedArgs.cardId, parsedArgs.memberId);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
          };
        }

        // --------------------------------------------------
        // Delete a comment from a card
        // --------------------------------------------------
        case 'trello_delete_comment': {
          const parsedArgs = validateDeleteCommentRequest(args);
          await trelloClient.deleteComment(parsedArgs.cardId, parsedArgs.actionId);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      console.error(`Error executing tool ${request.params.name}: ${getErrorMessage(error)}`);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: getErrorMessage(error),
            }),
          },
        ],
      };
    }
  });

  // --------------------------------------------------
  // Handle ListToolsRequest (return the list of registered tools)
  // --------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = [
      trelloGetAllowedBoardsTool,
      trelloGetCardsByListTool,
      trelloGetListsTool,
      trelloGetRecentActivityTool,
      trelloAddCardTool,
      trelloUpdateCardTool,
      trelloArchiveCardTool,
      trelloAddListTool,
      trelloArchiveListTool,
      trelloGetMyCardsTool,
      trelloSearchAllBoardsTool,
      trelloMoveCardTool,
      trelloAddCommentTool,
      trelloGetLabelsTool,
      trelloAddLabelTool,
      trelloGetChecklistsTool,
      trelloCreateChecklistTool,
      trelloAddCheckItemTool,
      trelloUpdateCheckItemTool,
      trelloDeleteCheckItemTool,
      trelloGetCustomFieldsTool,
      trelloGetCustomFieldItemsTool,
      trelloSetCustomFieldTool,
      trelloGetCardAttachmentsTool,
      trelloDownloadAttachmentTool,
      trelloGetBoardMembersTool,
      trelloAssignCardMemberTool,
      trelloUnassignCardMemberTool,
      trelloDeleteCommentTool,
    ];

    return {
      tools: readOnly ? allTools.filter(t => !WRITE_TOOLS.has(t.name)) : allTools,
    };
  });

  // --------------------------------------------------
  // Start the MCP server
  // --------------------------------------------------
  const transport = new StdioServerTransport();
  console.error('Connecting server to transport...');
  await server.connect(transport);

  console.error('Trello MCP Server running on stdio');
}

main().catch(error => {
  console.error(`Fatal error in main(): ${getErrorMessage(error)}`);
  process.exit(1);
});
