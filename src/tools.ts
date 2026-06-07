import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import * as hn from "./hn-client.js";
import { GetStoryInput, SearchInput, TopStoriesInput } from "./schemas.js";

function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function safe<A>(
  handler: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (err) {
      // McpServer.registerTool validates inputs against `inputSchema` before
      // invoking the handler, so a ZodError reaching here is unexpected.
      // Kept as a defensive net for any handler that re-parses input itself.
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        return errorResult(`Invalid input — ${issues.join("; ")}`);
      }
      if (err instanceof Error && err.name === "AbortError") {
        return errorResult("HN API request timed out. Try again in a moment.");
      }
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`HN API unavailable: ${message}`);
    }
  };
}

function formatStoryLine(s: hn.HnStory, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const title = s.title ? hn.stripHtml(s.title) : "(deleted)";
  const link = s.url ?? hn.permalink(s.id);
  const score = s.score ?? 0;
  const comments = s.descendants ?? 0;
  const author = s.by ?? "(unknown)";
  return `${prefix}${title}\n   by ${author} • ${score} points • ${comments} comments\n   ${link}`;
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "hn_top_stories",
    {
      title: "Hacker News top stories",
      description:
        "Fetch the current top stories from the Hacker News front page. Returns title, author, score, comment count, and URL for each.",
      inputSchema: TopStoriesInput,
    },
    safe(async ({ limit }: { limit: number }) => {
      const stories = await hn.topStories(limit);
      if (stories.length === 0) {
        return textResult("No stories returned by Hacker News.");
      }
      const lines = stories.map((s, i) => formatStoryLine(s, i));
      return textResult(`Top ${stories.length} HN stories:\n\n${lines.join("\n\n")}`);
    }),
  );

  server.registerTool(
    "hn_get_story",
    {
      title: "Get a Hacker News story",
      description:
        "Fetch a single Hacker News story by id. Returns title, author, score, body, and URL. Comments, jobs, polls, and pollopts are rejected — use Hacker News directly for those.",
      inputSchema: GetStoryInput,
    },
    safe(async ({ id }: { id: number }) => {
      const item = await hn.getItem(id);
      if (item === null) {
        return errorResult(`Item ${id} not found.`);
      }
      if (item.deleted) {
        return errorResult(`Item ${id} has been deleted.`);
      }
      if (item.dead) {
        return errorResult(`Item ${id} has been flagged and is no longer visible.`);
      }
      if (item.type !== "story") {
        return errorResult(
          `Item ${id} is a ${item.type}, not a story. hn_get_story only returns stories.`,
        );
      }
      const head = formatStoryLine(item);
      const body = item.text ? `\n\n${hn.stripHtml(item.text)}` : "";
      return textResult(`${head}${body}`);
    }),
  );

  server.registerTool(
    "hn_search",
    {
      title: "Search Hacker News",
      description: "Full-text search HN stories via the Algolia HN API. Returns up to `limit` matching stories.",
      inputSchema: SearchInput,
    },
    safe(async ({ query, limit }: { query: string; limit: number }) => {
      const hits = await hn.search(query, limit);
      if (hits.length === 0) {
        return textResult(`No HN stories matched "${query}".`);
      }
      const lines = hits.map((h, i) => {
        const link = h.url ?? hn.permalink(h.id);
        return `${i + 1}. ${h.title}\n   by ${h.author} • ${h.points} points • ${h.num_comments} comments • ${h.created_at}\n   ${link}`;
      });
      return textResult(`HN search results for "${query}" (${hits.length}):\n\n${lines.join("\n\n")}`);
    }),
  );
}
