# Architecture

`mcp-server-sample` is a stdio MCP server with one boundary in and one boundary out.

## Boundaries

- **In:** an MCP client (Claude Desktop, the local probe script, or the integration test)
  speaks newline-delimited JSON-RPC 2.0 over `stdin`/`stdout`.
- **Out:** the Hacker News public APIs:
  - Firebase HN API for the front page list and per-id item fetches
    (`https://hacker-news.firebaseio.com/v0/`).
  - Algolia HN search for full-text search (`https://hn.algolia.com/api/v1/search`).

Neither boundary requires authentication. There are no secrets, no env vars, and no
persistent state.

## Layers

Each layer has one responsibility and one direction of data flow.

```
src/index.ts          MCP server boot + StdioServerTransport
       │ registerTools(server)
       ▼
src/tools.ts          Three registerTool calls + safe() wrapper
       │ formatStoryLine, errorResult, textResult
       ▼
src/hn-client.ts      Firebase + Algolia wrappers + helpers
       │ fetchJson, concurrentMap, stripHtml, permalink
       ▼
       fetch (native Node 20 fetch, with AbortController timeout)
```

### `src/index.ts`

Constructs `new McpServer({ name, version })`, calls `registerTools(server)`, and connects
a `StdioServerTransport`. The only place that touches stdio. Logs the ready banner to
**stderr**; stdout is reserved for JSON-RPC.

### `src/tools.ts`

Registers the three tools via `server.registerTool(name, definition, handler)`. Every
handler is wrapped in a single `safe()` function that catches any thrown error and
translates it into `{ content: [{ type: "text", text }], isError: true }`:

- `ZodError` → "Invalid input — …" (defensive; the SDK validates inputs before the handler
  runs, but the wrapper covers any handler that re-parses).
- `AbortError` → "HN API request timed out. Try again in a moment."
- Anything else → "HN API unavailable: \<message\>" (no stack trace).

This means the three handlers never have to think about error reporting — they just
throw on failure and `safe()` shapes the response.

### `src/hn-client.ts`

Pure functions over the two HN APIs. Notable design points:

- **`fetchJson` with `AbortController`.** Every HTTP request has an 8s timeout. The default
  `fetch` in Node has none.
- **`concurrentMap` for the top-stories N+1 fetch.** `topstories.json` returns up to ~500
  ids; we slice down to a small over-fetch buffer (`min(limit*2 + 10, 50)`) and run the
  per-id fetches with bounded concurrency (10) so we don't hammer the API or stall serially.
- **Filter, then slice.** Top stories filters out job posts and `dead`/`deleted` items
  before slicing to the user's `limit`, so the result is almost always full.
- **`stripHtml`** is intentionally naive — HN uses a small, stable subset of HTML
  (`<p>`, `<i>`, `<a>`, `<pre>`, `<code>`) plus a handful of named entities. A real HTML
  parser would be overkill for a portfolio demo wrapper.
- **`permalink(id)`** is the fallback URL for Ask HN / Show HN posts that have no `url`
  field — the HN comment-page link.

### `src/schemas.ts`

Three zod field-records (a `Record<string, ZodType>`, **not** `z.object({...})`) — that's
the shape the SDK's `registerTool` expects for `inputSchema`. The SDK converts them to
JSON Schema for the `tools/list` response automatically.

## Error policy

Every error path returns a friendly text message with `isError: true`. **No raw exception
ever crosses the JSON-RPC boundary**, and **no upstream stack trace is ever included** in
the user-visible message. The smoke tests cover each error path and assert both invariants.

## Why stdio + no auth

This sample is deliberately a 30-minute integration: the smallest thing that demonstrates
correct MCP plumbing. Real production MCP servers often add OAuth flows, HTTP/SSE
transports, persistent state, or rate-limit handling — none of which belong in a portfolio
sample meant to be cloned and read in one sitting.
