#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { TrelloClient } from "./trello-client.js";
import {
  validateGetCardsListRequest,
  validateGetRecentActivityRequest,
  validateAddCardRequest,
  validateUpdateCardRequest,
  validateArchiveCardRequest,
  validateAddListRequest,
  validateArchiveListRequest,
  validateSearchRequest,
} from "./validators.js";

// --------------------------------------------------
// Define tools for Trello (Tool)
// --------------------------------------------------

const trelloGetCardsByListTool: Tool = {
  name: "trello_get_cards_by_list",
  description: "Retrieves a list of cards contained in the specified list ID.",
  inputSchema: {
    type: "object",
    properties: {
      listId: {
        type: "string",
        description: "Trello list ID",
      },
    },
    required: ["listId"],
  },
};

const trelloGetListsTool: Tool = {
  name: "trello_get_lists",
  description: "Retrieves all lists in the board.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const trelloGetRecentActivityTool: Tool = {
  name: "trello_get_recent_activity",
  description:
    "Retrieves the most recent board activity. The 'limit' argument can specify how many to retrieve.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Number of activities to retrieve (default: 10)",
      },
    },
  },
};

const trelloAddCardTool: Tool = {
  name: "trello_add_card",
  description: "Adds a card to the specified list.",
  inputSchema: {
    type: "object",
    properties: {
      listId: { type: "string", description: "The ID of the list to add to" },
      name: { type: "string", description: "The title of the card" },
      description: {
        type: "string",
        description: "Details of the card (optional)",
      },
      dueDate: {
        type: "string",
        description:
          "Due date (can be specified in ISO8601 format, etc. Optional)",
      },
      labels: {
        type: "array",
        description: "Array of label IDs (optional)",
        items: { type: "string" },
      },
    },
    required: ["listId", "name"],
  },
};

const trelloUpdateCardTool: Tool = {
  name: "trello_update_card",
  description: "Updates the content of a card.",
  inputSchema: {
    type: "object",
    properties: {
      cardId: {
        type: "string",
        description: "The ID of the card to be updated",
      },
      name: {
        type: "string",
        description: "The title of the card (optional)",
      },
      description: {
        type: "string",
        description: "Details of the card (optional)",
      },
      dueDate: {
        type: "string",
        description:
          "Due date (can be specified in ISO8601 format, etc. Optional)",
      },
      labels: {
        type: "array",
        description: "An array of label IDs (optional)",
        items: { type: "string" },
      },
    },
    required: ["cardId"],
  },
};

const trelloArchiveCardTool: Tool = {
  name: "trello_archive_card",
  description: "Archives (closes) the specified card.",
  inputSchema: {
    type: "object",
    properties: {
      cardId: {
        type: "string",
        description: "The ID of the card to archive",
      },
    },
    required: ["cardId"],
  },
};

const trelloAddListTool: Tool = {
  name: "trello_add_list",
  description: "Adds a new list to the board.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the list",
      },
    },
    required: ["name"],
  },
};

const trelloArchiveListTool: Tool = {
  name: "trello_archive_list",
  description: "Archives (closes) the specified list.",
  inputSchema: {
    type: "object",
    properties: {
      listId: {
        type: "string",
        description: "The ID of the list to archive",
      },
    },
    required: ["listId"],
  },
};

const trelloGetMyCardsTool: Tool = {
  name: "trello_get_my_cards",
  description: "Retrieves cards assigned to you on the configured board.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const trelloSearchBoardTool: Tool = {
  name: "trello_search_board",
  description:
    "Searches for cards and other items within the configured board.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search keyword" },
      limit: {
        type: "number",
        description: "Maximum number of results to retrieve (default: 10)",
      },
    },
    required: ["query"],
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
    console.error("TRELLO_API_KEY / TRELLO_TOKEN / TRELLO_BOARD_ID are not set.");
    process.exit(1);
  }

  console.error("Starting Trello MCP Server...");

  // Initialize MCP Server
  const server = new Server(
    {
      name: "Trello MCP Server",
      version: "1.0.0",
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
    console.error("Received CallToolRequest:", request.params.name);
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      switch (request.params.name) {
        case "trello_get_cards_by_list": {
          const validated = validateGetCardsListRequest(args);
          const response = await trelloClient.getCardsByList(validated.listId);
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_get_lists": {
          const response = await trelloClient.getLists();
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_get_recent_activity": {
          const validated = validateGetRecentActivityRequest(args);
          const response = await trelloClient.getRecentActivity(validated.limit);
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_add_card": {
          const validated = validateAddCardRequest(args);
          const response = await trelloClient.addCard({
            listId: validated.listId,
            name: validated.name,
            description: validated.description,
            dueDate: validated.dueDate,
            labels: validated.labels,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_update_card": {
          const validated = validateUpdateCardRequest(args);
          const response = await trelloClient.updateCard({
            cardId: validated.cardId,
            name: validated.name,
            description: validated.description,
            dueDate: validated.dueDate,
            labels: validated.labels,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_archive_card": {
          const validated = validateArchiveCardRequest(args);
          const response = await trelloClient.archiveCard(validated.cardId);
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_add_list": {
          const validated = validateAddListRequest(args);
          const response = await trelloClient.addList(validated.name);
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_archive_list": {
          const validated = validateArchiveListRequest(args);
          const response = await trelloClient.archiveList(validated.listId);
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_get_my_cards": {
          const response = await trelloClient.getMyCards();
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        case "trello_search_board": {
          const validated = validateSearchRequest(args);
          const response = await trelloClient.searchBoard(validated.query, validated.limit);
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      console.error("Error executing tool:", error instanceof Error ? error.message : String(error));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
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
    console.error("Received ListToolsRequest");
    return {
      tools: [
        trelloGetCardsByListTool,
        trelloGetListsTool,
        trelloGetRecentActivityTool,
        trelloAddCardTool,
        trelloUpdateCardTool,
        trelloArchiveCardTool,
        trelloAddListTool,
        trelloArchiveListTool,
        trelloGetMyCardsTool,
        trelloSearchBoardTool,
      ],
    };
  });

  // --------------------------------------------------
  // Start the MCP server
  // --------------------------------------------------
  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("Trello MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
