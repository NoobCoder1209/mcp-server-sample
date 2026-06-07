import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "../src/tools.js";

type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/**
 * Capture handlers passed to McpServer.registerTool so we can invoke them
 * directly. The real McpServer.registerTool signature is
 *   (name, definition, handler) => RegisteredTool
 * so a tiny mock that records the third argument by name is enough.
 */
function makeMockServer(): { handlers: Map<string, Handler>; server: McpServer } {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _definition: unknown, handler: Handler) => {
      handlers.set(name, handler);
      return undefined as unknown;
    },
  } as unknown as McpServer;
  return { handlers, server };
}

/**
 * Build a fake fetch Response. Only the bits hn-client touches matter:
 * `ok`, `status`, and `json()`.
 */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("tools smoke (mocked fetch)", () => {
  let handlers: Map<string, Handler>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const created = makeMockServer();
    handlers = created.handlers;
    registerTools(created.server);

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers all three tools", () => {
    expect(handlers.has("hn_top_stories")).toBe(true);
    expect(handlers.has("hn_get_story")).toBe(true);
    expect(handlers.has("hn_search")).toBe(true);
  });

  describe("hn_top_stories", () => {
    it("returns the requested number of stories and filters non-story types", async () => {
      // Route mocked fetch by URL: topstories returns ids, item/N returns
      // a mix of stories + a job that must be filtered out.
      const items: Record<number, unknown> = {
        1: { id: 1, type: "story", by: "alice", title: "First", score: 100, descendants: 5, url: "https://a.example" },
        2: { id: 2, type: "story", by: "bob", title: "Second", score: 50, descendants: 2, url: "https://b.example" },
        3: { id: 3, type: "job", by: "recruiter", title: "We are hiring", score: 10 },
        4: { id: 4, type: "story", by: "carol", title: "Third", score: 30, descendants: 1, url: "https://c.example" },
      };
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/topstories.json")) return jsonResponse([1, 2, 3, 4]);
        const match = /\/item\/(\d+)\.json$/.exec(url);
        if (match) {
          const id = Number(match[1]);
          return jsonResponse(items[id] ?? null);
        }
        throw new Error(`unexpected url: ${url}`);
      });

      const handler = handlers.get("hn_top_stories");
      expect(handler).toBeDefined();
      const result = await handler!({ limit: 3 });

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.type).toBe("text");
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Top 3 HN stories");
      expect(text).toContain("First");
      expect(text).toContain("Second");
      expect(text).toContain("Third");
      // Job item must be filtered out.
      expect(text).not.toContain("We are hiring");
      // Order must match input id order (1 before 2 before 4).
      expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
      expect(text.indexOf("Second")).toBeLessThan(text.indexOf("Third"));
    });

    it("returns isError when topstories returns 503", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null, { ok: false, status: 503 }));

      const handler = handlers.get("hn_top_stories")!;
      const result = await handler({ limit: 5 });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toMatch(/HN API unavailable/);
      expect(text).toContain("HTTP 503");
    });
  });

  describe("hn_get_story", () => {
    it("formats a story with url, author, score, comments", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: 42,
          type: "story",
          by: "douglas",
          title: "Hitchhiker",
          url: "https://example.com/42",
          score: 1042,
          descendants: 7,
        }),
      );

      const handler = handlers.get("hn_get_story")!;
      const result = await handler({ id: 42 });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Hitchhiker");
      expect(text).toContain("douglas");
      expect(text).toContain("1042 points");
      expect(text).toContain("7 comments");
      expect(text).toContain("https://example.com/42");
    });

    it("falls back to permalink and renders stripped text body for Ask HN-style stories", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: 100,
          type: "story",
          by: "asker",
          title: "Ask HN: how to test?",
          // No url; has text with HTML + entities to confirm stripHtml runs.
          text: "<p>Use <i>vitest</i> &amp; mock fetch.</p>",
          score: 5,
          descendants: 0,
        }),
      );

      const handler = handlers.get("hn_get_story")!;
      const result = await handler({ id: 100 });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("https://news.ycombinator.com/item?id=100");
      expect(text).toContain("Use vitest & mock fetch.");
      // HTML tags must be stripped.
      expect(text).not.toContain("<p>");
      expect(text).not.toContain("<i>");
      expect(text).not.toContain("&amp;");
    });

    it("returns isError when item is null (not found)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null));

      const handler = handlers.get("hn_get_story")!;
      const result = await handler({ id: 999 });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toBe("Item 999 not found.");
    });

    it("rejects deleted items with isError", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 300, deleted: true }));

      const handler = handlers.get("hn_get_story")!;
      const result = await handler({ id: 300 });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Item 300");
      expect(text).toMatch(/deleted/i);
    });

    it("rejects non-story types (e.g. comment) with isError", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: 200, type: "comment", by: "bob", text: "nice" }),
      );

      const handler = handlers.get("hn_get_story")!;
      const result = await handler({ id: 200 });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Item 200");
      expect(text).toContain("comment");
      expect(text).toContain("not a story");
    });
  });

  describe("hn_search", () => {
    it("formats Algolia hits with id, author, points, comments, url", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          hits: [
            {
              objectID: "111",
              title: "Anthropic launches X",
              url: "https://example.com/x",
              author: "alice",
              points: 200,
              num_comments: 12,
              created_at: "2026-01-01T00:00:00.000Z",
            },
            {
              objectID: "222",
              title: "Anthropic launches Y",
              url: null, // exercises permalink fallback in the search path
              author: "bob",
              points: 50,
              num_comments: 3,
              created_at: "2026-02-01T00:00:00.000Z",
            },
          ],
        }),
      );

      const handler = handlers.get("hn_search")!;
      const result = await handler({ query: "anthropic", limit: 2 });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('HN search results for "anthropic" (2)');
      expect(text).toContain("Anthropic launches X");
      expect(text).toContain("Anthropic launches Y");
      expect(text).toContain("alice");
      expect(text).toContain("bob");
      expect(text).toContain("200 points");
      expect(text).toContain("12 comments");
      expect(text).toContain("https://example.com/x");
      // Hit with null url should fall back to the HN permalink for id 222.
      expect(text).toContain("https://news.ycombinator.com/item?id=222");

      // Sanity check the URL we hit Algolia with (query + tags=story + hitsPerPage).
      const calledWith = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledWith).toContain("hn.algolia.com");
      expect(calledWith).toContain("query=anthropic");
      expect(calledWith).toContain("tags=story");
      expect(calledWith).toContain("hitsPerPage=2");
    });

    it("returns isError when fetch itself rejects (network down)", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      const handler = handlers.get("hn_search")!;
      const result = await handler({ query: "anything", limit: 5 });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toMatch(/HN API unavailable/);
      expect(text).toContain("network down");
    });
  });
});
