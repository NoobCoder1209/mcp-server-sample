# mcp-server-sample — A minimal MCP server (TypeScript)

A minimal **Model Context Protocol** server in TypeScript that wraps the
[Hacker News](https://news.ycombinator.com/) public API. Drop the config snippet below into
Claude Desktop and your model can browse, fetch, and search HN through three tools.

![demo](docs/screenshots/demo.gif)

## What it shows

- A correct stdio MCP server built on the latest `@modelcontextprotocol/sdk` (v1.x), using the
  high-level `McpServer.registerTool` API.
- Three tools wrapping a real public API, with strict zod input validation and a single
  central error wrapper that funnels every failure into a friendly `isError: true` response —
  no thrown exceptions ever cross the JSON-RPC boundary.
- Hermetic vitest smoke tests with a mocked fetch, plus a probe-script integration test that
  spawns the built server and exercises the JSON-RPC handshake end-to-end.

## Skills demonstrated

`MCP` · `Model Context Protocol` · `Anthropic Ecosystem` · `TypeScript` · `API Integration` ·
`JSON-RPC` · `Node.js` · `Vitest`

## Quick start (Claude Desktop)

Drop this into your `claude_desktop_config.json` — replace `<absolute-path-to-mcp-server-sample>`
with the absolute path to your clone of this repo:

```json
{
  "mcpServers": {
    "hn": {
      "command": "node",
      "args": ["<absolute-path-to-mcp-server-sample>/dist/index.js"]
    }
  }
}
```

Then run, in this directory:

```bash
pnpm install
pnpm build
```

Fully **quit and relaunch** Claude Desktop. The MCP slider in the conversation input confirms
the server loaded.

**Config file paths:**

| OS      | Path                                                                |
| ------- | ------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json`   |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                       |
| Linux   | Not supported by Claude Desktop                                     |

## Quick start (local probe — no Claude Desktop)

The probe script spawns the server and runs the JSON-RPC handshake against it. Useful for a
sanity check, and what generates the demo GIF above.

```bash
pnpm install
pnpm build
pnpm probe
```

You should see `initialize` succeed, the three tool names listed, and live HN search results
for "Anthropic".

## How it works

```
Claude Desktop ──stdio──▶  src/index.ts
                                │
                                ▼
                          McpServer + StdioServerTransport
                                │
                                ▼
                          src/tools.ts
                          (registerTools, safe() wrapper)
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
            hn_top_stories   hn_get_story   hn_search
                  │             │             │
                  └─────────────┼─────────────┘
                                ▼
                          src/hn-client.ts
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
        Firebase HN API                 Algolia HN search
        (topstories, item)              (full-text)
```

## Tools

| Name              | Description                                            | Inputs                                                          | Example output                                                                |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `hn_top_stories`  | Current top stories from the HN front page.            | `limit?: int (1–50, default 10)`                                | A numbered list of titles with author, score, comment count, and URL.         |
| `hn_get_story`    | A single HN story by id. Rejects deleted, dead, or non-story items (comments, jobs, polls) with a friendly error. | `id: positive int`                                              | Title, author, score, comments, URL, and the body text if any (HTML stripped). |
| `hn_search`       | Full-text search over HN via the Algolia HN API.       | `query: string (1–200 chars)`, `limit?: int (1–20, default 5)`  | A numbered list of matching stories with author, score, comments, URL, and date. |

## Development

```bash
pnpm install
pnpm dev        # tsx src/index.ts (no build step)
pnpm build      # tsc → dist/
pnpm test       # vitest
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
pnpm probe      # spawn the built server and run the demo handshake
```

CI runs `install → lint → typecheck → build → test` on Node 20.

### Regenerating the demo GIF

The terminal GIF is recorded with [vhs](https://github.com/charmbracelet/vhs):

```bash
brew install vhs            # or follow https://github.com/charmbracelet/vhs#installation
pnpm build
vhs docs/demo.tape          # writes docs/screenshots/demo.gif
```

## License

[MIT](./LICENSE)
