# `mcp-server-sample` — Execution Plan

> Self-contained build plan. Inherits shared standards from the master plan.

## Goal

A minimal, well-documented **Model Context Protocol** server in TypeScript
that wraps a free, no-auth public API. Anyone running Claude Desktop (or any
MCP-aware client) can plug it in via a config snippet shipped in the README.

MCP is one of the rarest, highest-paid skills on Upwork right now. A working
sample = strong signal.

**Sells:** MCP, Model Context Protocol, Anthropic Ecosystem, TypeScript, API Integration.

## Scope (must-haves)

1. Implements the official MCP server spec using `@modelcontextprotocol/sdk`.
2. Connects via **stdio transport** (the easiest one to integrate with Claude Desktop).
3. Exposes **3 tools** that wrap a single public API. Choose the API once and
   build all tools against it. Recommended: **Hacker News** (Firebase API,
   no auth, well-documented, recognisable).
   - `hn_top_stories(limit: int = 10)` — list top story IDs + titles
   - `hn_get_story(id: int)` — full story details (title, url, author, score, comment count)
   - `hn_search(query: string, limit: int = 5)` — uses Algolia's HN search endpoint
4. Handles errors gracefully (HTTP non-200 → MCP `isError: true` response).
5. README includes a **drop-in `claude_desktop_config.json` snippet** so a user
   can wire the server into Claude Desktop in 30 seconds.
6. Optional: tiny mock client script (`scripts/probe.ts`) that talks to the
   server without needing Claude Desktop, for the GIF.

## Out of scope

- No authentication / OAuth flows.
- No SSE / HTTP transport — stdio only.
- No persistent state, caching, or DB.
- No rate limit handling beyond surfacing API errors.
- No second API.

## Tech stack

- **Language:** TypeScript 5.x, Node 20 LTS
- **SDK:** `@modelcontextprotocol/sdk`
- **HTTP:** native `fetch` (no axios)
- **Validation:** `zod` (also used to derive tool input schemas)
- **Package manager:** `pnpm`
- **Linting:** `eslint` + `prettier`
- **Testing:** `vitest` (one smoke test mocking `fetch`)
- **CI:** GitHub Actions

## File tree

```
mcp-server-sample/
  README.md
  PLAN.md
  LICENSE                       ← MIT
  .gitignore
  .env.example                  ← (none required, kept for consistency)
  package.json
  pnpm-lock.yaml
  tsconfig.json
  .eslintrc.cjs
  .prettierrc
  vitest.config.ts
  .github/
    workflows/ci.yml
  src/
    index.ts                    ← MCP server boot, stdio transport
    tools.ts                    ← tool definitions + handlers
    hn-client.ts                ← thin HN API wrapper
    schemas.ts                  ← zod schemas for tool inputs
  test/
    tools.smoke.test.ts
  scripts/
    probe.ts                    ← optional local probe (sends MCP requests over stdin)
  docs/
    architecture.md
    screenshots/
      demo.gif                  ← Claude Desktop using the server, or probe output
      claude-desktop-config.png ← screenshot of the config snippet in place
```

## Step-by-step build

### 1. Bootstrap

```bash
pnpm init
pnpm add @modelcontextprotocol/sdk zod
pnpm add -D typescript @types/node tsx vitest eslint @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin prettier
npx tsc --init
```

`tsconfig.json`: `"target": "ES2022"`, `"module": "Node16"`, `"moduleResolution": "Node16"`,
`"strict": true`, `"outDir": "dist"`, `"declaration": true` (lets users
`npm i` and import types if they want).

`package.json`:
```json
{
  "type": "module",
  "bin": { "mcp-server-sample": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "probe": "tsx scripts/probe.ts",
    "test": "vitest run",
    "lint": "eslint . --ext .ts"
  }
}
```

### 2. `src/hn-client.ts`

Thin wrapper around HN endpoints:
```ts
const BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA = "https://hn.algolia.com/api/v1";

export async function topStoryIds(): Promise<number[]> {
  const r = await fetch(`${BASE}/topstories.json`);
  if (!r.ok) throw new Error(`HN topstories failed: ${r.status}`);
  return r.json();
}

export async function getItem(id: number) { /* … */ }
export async function search(query: string, limit: number) { /* … */ }
```

### 3. `src/schemas.ts`

```ts
import { z } from "zod";
export const TopStoriesInput = z.object({ limit: z.number().int().min(1).max(50).default(10) });
export const GetStoryInput   = z.object({ id: z.number().int() });
export const SearchInput     = z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) });
```

### 4. `src/tools.ts`

Define tools as MCP-compliant objects. Each tool: name, description, input
schema (zod → JSON schema via `zod-to-json-schema` or hand-written), handler
returning the MCP `CallToolResult` shape (`content: [{ type: "text", text: "..." }]`).

Handler bodies: validate input with zod, call `hn-client`, format output as a
human-readable text block (clients can also parse it). Surface errors as
`{ content: [...], isError: true }`.

### 5. `src/index.ts`

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, dispatchTool } from "./tools.js";

const server = new Server(
  { name: "mcp-server-sample", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (req) =>
  dispatchTool(req.params.name, req.params.arguments ?? {}),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 6. `scripts/probe.ts`

Sends a few JSON-RPC requests over stdio for local sanity-checking — useful
for the GIF if you don't want to record Claude Desktop. Spawns the server,
sends `tools/list`, then `tools/call` for `hn_top_stories`, prints output.

### 7. Smoke test

`vi.mock` `fetch` (or use `undici`'s mock pool). One test: calling
`hn_top_stories` returns text containing the mocked title.

### 8. CI

- Setup Node 20 + pnpm
- `pnpm install --frozen-lockfile`
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`
- `pnpm build` to confirm dist compiles

### 9. README

1. **Title** — *mcp-server-sample — A minimal Model Context Protocol server (TypeScript)*
2. **Demo** — `docs/screenshots/demo.gif` (Claude Desktop calling `hn_search` for "Anthropic")
3. **What it shows**:
   - MCP server spec implementation, stdio transport
   - Three tools wrapping a real public API
   - Type-safe inputs via zod
   - Drop-in Claude Desktop config snippet
4. **Skills demonstrated** — MCP, Model Context Protocol, Anthropic Ecosystem, TypeScript, API Integration, JSON-RPC
5. **Quick start (Claude Desktop)** — explicit `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "hn-sample": {
         "command": "node",
         "args": ["/absolute/path/to/dist/index.js"]
       }
     }
   }
   ```
   Plus build instructions.
6. **Quick start (local probe, no Claude Desktop)**:
   ```bash
   pnpm install && pnpm build && pnpm probe
   ```
7. **How it works** — short paragraph + tiny diagram (client ↔ stdio ↔ server ↔ HN API)
8. **Tools** — table of name / description / inputs / example output
9. **License** — MIT

### 10. Polish + flip public

GIF or animated terminal recording. Topics: `mcp`, `model-context-protocol`,
`claude-desktop`, `anthropic`, `typescript`, `hacker-news`. Flip public.

## Verification

- [ ] Fresh clone: `pnpm install && pnpm build && pnpm probe` lists tools and calls one successfully against real HN
- [ ] Server connects to Claude Desktop using the snippet (manual test)
- [ ] Each tool's error path returns `isError: true` (test by passing bad input)
- [ ] Lint, type-check, tests, build all green in CI
- [ ] No env vars / secrets needed (HN is public)
- [ ] README config snippet uses an absolute path placeholder, not a hardcoded user path
- [ ] Topics + description set
- [ ] No mention of Claude Code / SAP / personal `~/.claude/` material

## Stretch (defer)

- Add a second public API (e.g. `wttr.in` weather) as a separate set of tools
  to show multi-tool wiring
- HTTP/SSE transport variant
- Auto-publish to npm so users can `npx mcp-server-sample`

v2 only — do not pull into v1.
