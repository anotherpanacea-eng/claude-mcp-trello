# Claude MCP Trello

A Model Context Protocol (MCP) server that provides tools for interacting with a single configured Trello board. Board-scoped by default, with rate limiting, input validation, audit logging, and an optional read-only mode.

<a href="https://glama.ai/mcp/servers/7vcnchsm63">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/7vcnchsm63/badge" alt="Claude Trello MCP server" />
</a>

## Getting Your Trello Credentials

You need three values: an API key, a token, and a board ID.

1. **API Key**: Go to https://trello.com/power-ups/admin and click on your Power-Up (or create one). Your API key is shown on the page.

2. **Token**: On the same page, click the link to generate a token. Authorize the app when prompted. Copy the token shown.

3. **Board ID**: Open your Trello board in a browser. The URL looks like `https://trello.com/b/AbCdEfGh/board-name`. The board ID is the 24-character hex string returned by the API — get it by visiting `https://api.trello.com/1/boards/AbCdEfGh?fields=id&key=YOUR_KEY&token=YOUR_TOKEN` (replace `AbCdEfGh` with the short ID from your board URL).

## Installation

### Prerequisites

- Node.js 20 or higher
- npm

### Build from Source

```bash
git clone https://github.com/anotherpanacea-eng/claude-mcp-trello.git
cd claude-mcp-trello
npm install
npm run build
```

### Configure for Claude Code

Add to your Claude Code settings (`.claude/settings.json` or via `claude mcp add`):

```bash
claude mcp add trello \
  -e TRELLO_API_KEY=your_key \
  -e TRELLO_TOKEN=your_token \
  -e TRELLO_BOARD_ID=your_board_id \
  -- node /absolute/path/to/claude-mcp-trello/build/index.js
```

Or add manually to your settings file:

```json
{
  "mcpServers": {
    "trello": {
      "command": "node",
      "args": ["/absolute/path/to/claude-mcp-trello/build/index.js"],
      "env": {
        "TRELLO_API_KEY": "your_key",
        "TRELLO_TOKEN": "your_token",
        "TRELLO_BOARD_ID": "your_board_id"
      }
    }
  }
}
```

### Configure for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "trello": {
      "command": "node",
      "args": ["/absolute/path/to/claude-mcp-trello/build/index.js"],
      "env": {
        "TRELLO_API_KEY": "your_key",
        "TRELLO_TOKEN": "your_token",
        "TRELLO_BOARD_ID": "your_board_id"
      }
    }
  }
}
```

Replace paths and credentials with your actual values. Keep the Trello token narrowly scoped to the board and permissions you actually need.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRELLO_API_KEY` | Yes | Your Trello API key |
| `TRELLO_TOKEN` | Yes | Your Trello API token |
| `TRELLO_BOARD_ID` | Yes | 24-character hex ID of the board to operate on |
| `TRELLO_READ_ONLY` | No | Set to `true` to disable all write operations |

## Available Tools (28)

### Cards
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_cards_by_list` | Get all cards in a list | |
| `trello_get_my_cards` | Get all cards assigned to you on the board | |
| `trello_add_card` | Create a new card (name, description, due date, labels) | Yes |
| `trello_update_card` | Update card fields (name, description, due date, labels) | Yes |
| `trello_archive_card` | Archive (close) a card | Yes |
| `trello_move_card` | Move a card to a different list | Yes |

### Lists
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_lists` | Get all lists on the board | |
| `trello_add_list` | Create a new list | Yes |
| `trello_archive_list` | Archive (close) a list | Yes |

### Members
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_board_members` | List all board members (for finding member IDs) | |
| `trello_assign_card_member` | Assign a member to a card | Yes |
| `trello_unassign_card_member` | Remove a member from a card | Yes |

### Comments
| Tool | Description | Write |
|------|-------------|-------|
| `trello_add_comment` | Add a comment to a card | Yes |
| `trello_delete_comment` | Delete a comment from a card | Yes |

### Labels
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_labels` | Get all labels on the board | |
| `trello_add_label` | Create a new label (name + color) | Yes |

### Checklists
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_checklists` | Get all checklists on a card with item states | |
| `trello_create_checklist` | Create a new checklist on a card | Yes |
| `trello_add_check_item` | Add an item to a checklist | Yes |
| `trello_update_check_item` | Update item name or mark complete/incomplete | Yes |
| `trello_delete_check_item` | Delete a checklist item | Yes |

### Custom Fields
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_custom_fields` | Get all custom field definitions on the board | |
| `trello_get_custom_field_items` | Get custom field values set on a card | |
| `trello_set_custom_field` | Set a custom field value on a card | Yes |

### Attachments
| Tool | Description | Write |
|------|-------------|-------|
| `trello_get_card_attachments` | List all attachments on a card | |
| `trello_download_attachment` | Download attachment content (base64) or get external URL | |

### Search & Activity
| Tool | Description | Write |
|------|-------------|-------|
| `trello_search_all_boards` | Search cards on the configured board | |
| `trello_get_recent_activity` | Get recent board activity (up to 100 actions) | |

## Example Prompts

Once configured, you can use natural language with Claude to interact with your Trello board:

**Board overview and task management:**
> "Show me all the lists on my board and how many cards are in each one."

> "Create a card called 'Update onboarding docs' in the To Do list with a due date of next Friday, and add a checklist with three items: review current docs, draft updates, get team feedback."

**Search, move, and organize:**
> "Find all cards assigned to me that are overdue, then move any that are still in 'In Progress' to the 'Needs Review' list."

> "Search for cards mentioning 'API migration' and add a comment to each one saying 'Blocked — waiting on vendor response.'"

**Custom fields and members:**
> "Show me the custom field values on the 'Q2 Planning' card, then set the Priority field to 'High' and assign it to Sarah."

## API Coverage Decisions

This server covers the Trello API endpoints most useful for day-to-day board work. Several API groups were intentionally excluded:

| API Group | Decision | Reason |
|-----------|----------|--------|
| **Board admin** (update settings, delete board, manage power-ups) | Excluded | Destructive and administrative — should require direct Trello access, not AI-mediated actions |
| **Board invitations** (invite/remove members, manage permissions) | Excluded | Access control changes are high-risk for an automated tool |
| **Webhooks** (create, delete, manage) | Excluded | Webhook management requires a publicly reachable callback URL; incompatible with local MCP server architecture |
| **Notifications** (list, mark read, update) | Excluded | User-facing notification management adds no value in an AI workflow |
| **Tokens/API keys** (view, revoke) | Excluded | Exposing credential management to an AI tool is a security antipattern |
| **Organizations/Workspaces** | Excluded | Out of scope for a board-scoped server; would require removing the single-board security boundary |
| **Action reactions** (emoji on comments) | Excluded | Low value relative to tool count inflation |
| **Action updates** (edit comments) | Excluded | Editing existing comments is rare; add + delete covers the practical cases |
| **Batch endpoint** (`/batch`) | Excluded | Trello's batch endpoint bypasses per-request validation and board scoping |
| **Attachment uploads** | Excluded | File uploads via AI introduce content provenance concerns; download-only is the safer boundary |

Contributions that expand coverage thoughtfully are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security Features

- **Board Scoping**: All card and list operations verify the resource belongs to the configured board before proceeding. Cross-board operations are rejected.
- **ID Validation**: All Trello IDs are validated as 24-character hex strings before hitting the API, preventing path traversal or injection.
- **Read-Only Mode**: Set `TRELLO_READ_ONLY=true` to hide and block all write tools. Write attempts return a clear error.
- **Audit Logging**: Every tool invocation is logged to stderr with timestamp, tool name, and relevant IDs (no content or credentials).
- **Request Limits**: Axios timeout (30s), response size cap (5MB), and request body cap (1MB) prevent hanging or memory exhaustion.
- **Rate Limiting**: Token bucket algorithm respects Trello's limits (300/10s per key, 100/10s per token). Requests queue automatically.

## Privacy Policy

This MCP server operates entirely on your local machine. It does not collect, store, or transmit any data to third parties beyond the Trello API calls you explicitly initiate.

- **Authentication**: Your Trello API key and token are passed as environment variables and used solely to authenticate requests to Trello's REST API (`api.trello.com`). They are never logged, stored on disk, or sent elsewhere.
- **Data flow**: All data flows directly between this server and Trello's API. No intermediary servers are involved.
- **Audit logs**: Tool invocations are logged to stderr (your local terminal) with tool names, timestamps, and Trello resource IDs. No card content, comments, or credentials appear in logs.
- **No telemetry**: This server includes no analytics, crash reporting, or usage tracking of any kind.
- **Board scoping**: The server is restricted to a single configured board. It cannot access other boards, workspaces, or Trello accounts beyond what the provided API token permits.

For Trello's own data handling, see [Atlassian's Privacy Policy](https://www.atlassian.com/legal/privacy-policy).

## Development

### Verification

```bash
npm run lint
npm run build
npm test
```

### Project Structure

```
src/
  index.ts          # MCP server entry point, tool definitions, request handlers
  trello-client.ts  # Trello API client with all HTTP methods
  validators.ts     # Input validation for all tool parameters
  types.ts          # TypeScript type definitions
  rate-limiter.ts   # Token bucket rate limiter
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Support

- **Bug reports and feature requests**: [GitHub Issues](https://github.com/anotherpanacea-eng/claude-mcp-trello/issues)
- **Contact**: anotherpanacea@gmail.com

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- Uses the [Trello REST API](https://developer.atlassian.com/cloud/trello/rest/)
