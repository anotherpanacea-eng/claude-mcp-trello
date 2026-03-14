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
  validateCreateChecklistRequest,
  validateDeleteCheckItemRequest,
  validateDownloadAttachmentRequest,
  validateGetCardAttachmentsRequest,
  validateGetCardsListRequest,
  validateGetChecklistsRequest,
  validateGetRecentActivityRequest,
  validateMoveCardRequest,
  validateObject,
  validateSearchBoardRequest,
  validateTrelloId,
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
]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function auditLog(toolName: string, args: Record<string, unknown>): void {
  const idFields: Record<string, unknown> = {};
  for (const key of ['listId', 'cardId', 'boardId']) {
    if (args[key] !== undefined) idFields[key] = args[key];
  }
  const idSummary = Object.keys(idFields).length > 0 ? ` ${JSON.stringify(idFields)}` : '';
  console.error(`[audit] ${new Date().toISOString()} ${toolName}${idSummary}`);
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
};

const trelloGetListsTool: Tool = {
  name: 'trello_get_lists',
  description: 'Retrieves all lists in the board.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const trelloGetRecentActivityTool: Tool = {
  name: 'trello_get_recent_activity',
  description:
    "Retrieves the most recent board activity. The 'limit' argument can specify how many to retrieve.",
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of activities to retrieve (default: 10)',
      },
    },
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
};

const trelloAddListTool: Tool = {
  name: 'trello_add_list',
  description: 'Adds a new list to the board.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the list',
      },
    },
    required: ['name'],
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
};

const trelloGetMyCardsTool: Tool = {
  name: 'trello_get_my_cards',
  description: 'Retrieves all cards related to your account.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const trelloSearchAllBoardsTool: Tool = {
  name: 'trello_search_all_boards',
  description:
    'Searches within the configured board only. The legacy tool name is kept for compatibility.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword' },
      limit: {
        type: 'number',
        description: 'Maximum number of results to retrieve (default: 10)',
      },
    },
    required: ['query'],
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
};

const trelloGetLabelsTool: Tool = {
  name: 'trello_get_labels',
  description: 'Retrieves all labels on the board.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const trelloAddLabelTool: Tool = {
  name: 'trello_add_label',
  description: 'Creates a new label on the board.',
  inputSchema: {
    type: 'object',
    properties: {
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
};

const trelloUpdateCheckItemTool: Tool = {
  name: 'trello_update_check_item',
  description:
    'Updates a checklist item — change its name, or mark it as complete/incomplete.',
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
};

// --------------------------------------------------
// Main server implementation
// --------------------------------------------------
async function main() {
  const trelloApiKey = process.env.TRELLO_API_KEY;
  const trelloToken = process.env.TRELLO_TOKEN;
  const trelloBoardId = process.env.TRELLO_BOARD_ID;

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

  const readOnly = process.env.TRELLO_READ_ONLY === 'true';

  console.error(`Starting Trello MCP Server...${readOnly ? ' (read-only mode)' : ''}`);

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
          // No arguments
          const response = await trelloClient.getLists();
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
          const response = await trelloClient.getRecentActivity(limit);
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
          const response = await trelloClient.addList(parsedArgs.name);
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
          const response = await trelloClient.getMyCards();
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        case 'trello_search_all_boards': {
          const parsedArgs = validateSearchBoardRequest(args);
          const limit = parsedArgs.limit ?? DEFAULT_SEARCH_LIMIT;
          const response = await trelloClient.searchAllBoards(parsedArgs.query, limit);
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
          const response = await trelloClient.getLabels();
          return {
            content: [{ type: 'text', text: JSON.stringify(response) }],
          };
        }

        // --------------------------------------------------
        // Create a new label on the board
        // --------------------------------------------------
        case 'trello_add_label': {
          const parsedArgs = validateAddLabelRequest(args);
          const response = await trelloClient.addLabel(parsedArgs.name, parsedArgs.color);
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
          const response = await trelloClient.addCheckItem(
            parsedArgs.checklistId,
            parsedArgs.name
          );
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
      trelloGetCardAttachmentsTool,
      trelloDownloadAttachmentTool,
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
