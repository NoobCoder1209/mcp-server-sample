# `mcp-server-sample` — Execution Plan

## How to use this plan

You are the build session for this repo. Read this whole file before doing anything else, then start executing immediately — no kickoff prompt needed.

**Working agreement:**

1. **Start without waiting.** Read this file end-to-end, then begin Phase 1 in the *Subagent playbook* below.
2. **Always ask the user about business decisions and business logic.** API choice, demo query content, screenshot framing. The "Business decisions" section below lists them.
3. **Ask the user when you are genuinely blocked.**
4. **Do not ask the user about engineering details.** SDK version, schema shape, file layout — make the call yourself.
5. **Use subagents aggressively.** Default to the playbook below.
6. **TaskCreate / TaskUpdate everything.**
7. **Pattern 3 only.** No deployed demo. README has a config snippet + screenshots. Never commit secrets.
8. **Follow shared standards** (MIT, README, CI, topics, private until verified).
9. **All `Agent` tool calls must pass `model: "opus"`.**
10. **Off-limits forever:** SAP, `~/.claude/`, RCA content.

## Branch + PR workflow (mandatory)

Every PLAN.md inherits this. Sessions never commit straight to `main`.

1. **One branch per phase.** Name branches `phase/<N>-<slug>` matching the build phases below. Examples: `phase/1-bootstrap`, `phase/2-core`, `phase/3-tests`, `phase/4-readme`, `phase/5-polish`. ~3–5 phases per repo, ~3–5 PRs per repo.
2. **Aggressive commits within a branch.** Push every meaningful commit to the working branch. WIP is fine on a feature branch.
3. **Open a PR when the phase is complete.** Use `gh pr create`. Clear title (`phase 2: core agent loop` style) and a short body summarising what changed.
4. **Run `/pr-reviewer` on every PR.** No exceptions. The reviewer reads the diff and produces findings.
5. **Decision rule:**
   - **Clean review (zero findings) → auto-merge** with `gh pr merge --squash --auto`. Move on to the next phase.
   - **Any findings (even nits) → surface them to the user.** Do NOT auto-merge. Wait for user direction (fix on the same branch, defer, or override).
6. **`main` stays green.** Phase branches can be WIP; `main` only ever gets reviewed-clean code.
7. **Branch naming + commit messages must follow `git-safety-standards`** (`feature/`, `fix/`, `docs/` prefixes acceptable as alternatives to `phase/N-` when a change spans phases).
8. **Never `--force` push to `main`.** Force-push to your own phase branches is fine before the PR is opened.

## Subagent playbook (this repo)

MCP is moving fast. Research-heavy phase 1. 3 subagents per phase max.

**Phase 1 — Research (parallel):**
- `Explore` (Opus): "Find the latest `@modelcontextprotocol/sdk` server example for stdio transport in TypeScript, including `ListToolsRequestSchema` + `CallToolRequestSchema` handlers. Return ≤80-line skeleton."
- `Explore` (Opus): "Find Hacker News public API endpoints (Firebase + Algolia) needed for top-stories, item-by-id, and search. Return URLs, response shapes, rate limits."
- `Explore` (Opus): "Find the canonical `claude_desktop_config.json` snippet for wiring a local MCP stdio server. Return the exact JSON, and note Windows vs macOS path differences."

**Phase 2 — Design (single):**
- `Plan` (Opus): "Given the research and this PLAN.md, propose the file tree, three tool schemas, and a 4-step build order. Return as a checklist."

**Phase 3 — Build:** main session writes the code. Dispatch `Explore` only on stuck-on-API-detail moments.

**Phase 4 — Review (parallel):**
- `code-reviewer` (Opus): "Review for MCP spec compliance, error path correctness (`isError: true`), zod input validation, README config snippet correctness. High effort."
- `tester` (Opus): "Write smoke tests mocking `fetch` for each tool's happy path + one error path. Add a probe-script test that spawns the server and checks `tools/list`."

**Phase 5 — Polish:** capture GIF (probe.ts output works if Claude Desktop is unavailable), apply review, ask user before flipping public.

---

## Goal

A minimal, well-documented **Model Context Protocol** server in TypeScript
that wraps a free, no-auth public API. Anyone running Claude Desktop can plug
it in via a config snippet shipped in the README.

MCP is one of the rarest, highest-paid skills on Upwork right now.

**Sells:** MCP, Model Context Protocol, Anthropic Ecosystem, TypeScript, API Integration.

## Business decisions to ask the user about

- **Which public API to wrap** — recommend **Hacker News** (recognisable, stable, no auth). Alternatives: Wikipedia REST, GitHub public-repo metadata, NASA APOD.
- **Demo query for the GIF** — recommend something topical (e.g. "search HN for 'Anthropic'"), but the user may have a brand-aligned topic.
- **Whether to publish to npm** — defaults to "no" for v1. Ask before doing.

## Scope (must-haves)

1. Implements the official MCP server spec using `@modelcontextprotocol/sdk`.
2. **stdio transport.**
3. **3 tools** wrapping a single public API. Suggested (HN):
   - `hn_top_stories(limit: int = 10)`
   - `hn_get_story(id: int)`
   - `hn_search(query: string, limit: int = 5)`
4. Graceful errors → MCP `isError: true` response.
5. README includes drop-in `claude_desktop_config.json` snippet.
6. Optional `scripts/probe.ts` for local probe (great for the GIF).

## Production hygiene (must apply, not optional)

Inherits the master plan's "Production hygiene checklist." Repo-specific application:

- **No env vars or secrets** — HN is public. Still ship `.env.example` (kept empty) for consistency.
- **Validate every tool input with `zod`.** Already in scope. Reinforce: zod errors are caught by the dispatcher and surfaced via `{ content: [{ type: "text", text: "..." }], isError: true }`, never as raw exceptions.
- **Global try/catch around tool dispatch.** `tools.ts` wraps every handler. Network failures, timeouts, unexpected response shapes → friendly text in `isError: true`, never a thrown error that crashes the server.
- **No upstream stack traces in MCP responses.** Surface `"HN API unavailable. Try again in a moment."` rather than the raw fetch error.

## Out of scope

- No auth / OAuth.
- No SSE / HTTP transport.
- No persistent state, caching, or DB.
- No rate-limit handling beyond surfacing errors.
- No second API.

## Tech stack

- **Language:** TypeScript 5.x, Node 20 LTS
- **SDK:** `@modelcontextprotocol/sdk`
- **HTTP:** native `fetch`
- **Validation:** `zod`
- **Package manager:** `pnpm`
- **Linting:** `eslint` + `prettier`
- **Testing:** `vitest`
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
  .github/workflows/ci.yml
  src/
    index.ts                    ← MCP server boot, stdio transport
    tools.ts                    ← tool defs + handlers
    hn-client.ts                ← thin HN wrapper
    schemas.ts                  ← zod input schemas
  test/tools.smoke.test.ts
  scripts/probe.ts              ← optional local probe
  docs/
    architecture.md
    screenshots/
      demo.gif
      claude-desktop-config.png
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
`"strict": true`, `"outDir": "dist"`, `"declaration": true`.

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

Thin wrapper around HN endpoints — `topStoryIds()`, `getItem(id)`, `search(query, limit)`.

### 3. `src/schemas.ts`

```ts
export const TopStoriesInput = z.object({ limit: z.number().int().min(1).max(50).default(10) });
export const GetStoryInput   = z.object({ id: z.number().int() });
export const SearchInput     = z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) });
```

### 4. `src/tools.ts`

Tool defs (name + description + JSON schema). Handlers validate with zod, call
`hn-client`, format output as a text block, surface errors via `isError: true`.

### 5. `src/index.ts`

```ts
const server = new Server(
  { name: "mcp-server-sample", version: "0.1.0" },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (req) =>
  dispatchTool(req.params.name, req.params.arguments ?? {}),
);
await server.connect(new StdioServerTransport());
```

### 6. `scripts/probe.ts`

Spawns the server, sends `tools/list`, then `tools/call` for `hn_top_stories`. Prints output.

### 7. Smoke test

`vi.mock` `fetch`. One test: `hn_top_stories` returns text with mocked title. One test for an error path.

### 8. CI

Setup Node 20 + pnpm; `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm exec tsc --noEmit`; `pnpm test`; `pnpm build`.

### 9. README

1. Title — *mcp-server-sample — A minimal MCP server (TypeScript)*
2. Demo — `docs/screenshots/demo.gif`
3. What it shows
4. Skills demonstrated — MCP, Model Context Protocol, Anthropic Ecosystem, TypeScript, API Integration, JSON-RPC
5. Quick start (Claude Desktop) — exact JSON config snippet
6. Quick start (local probe) — `pnpm install && pnpm build && pnpm probe`
7. How it works (small diagram)
8. Tools — table (name / description / inputs / example output)
9. License — MIT

### 10. Polish + flip public

Topics: `mcp`, `model-context-protocol`, `claude-desktop`, `anthropic`, `typescript`, `hacker-news`. Ask user before flipping.

## Verification

- [ ] Fresh clone: `pnpm install && pnpm build && pnpm probe` lists tools and calls one against real HN
- [ ] Server connects to Claude Desktop using the snippet (manual test)
- [ ] Each tool's error path returns `isError: true`
- [ ] Network failure (e.g. mocked 503) returns a friendly `isError: true` text, not a thrown exception
- [ ] Lint, type-check, tests, build green in CI
- [ ] No env vars / secrets needed (HN public)
- [ ] README config snippet uses `<absolute-path>` placeholder, not a hardcoded user path
- [ ] Topics + description set

## Stretch (defer)

- Second API (`wttr.in`) showing multi-tool wiring
- HTTP/SSE transport variant
- Auto-publish to npm
