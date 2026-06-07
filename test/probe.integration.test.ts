import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverEntry = resolve(__dirname, "..", "dist", "index.js");
const built = existsSync(serverEntry);

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolListResult {
  tools: Array<{ name: string; description?: string }>;
}

interface InitializeResult {
  serverInfo?: { name?: string; version?: string };
}

/**
 * Minimal JSON-RPC over stdio harness, modeled on scripts/probe.ts.
 * Spawns the built server once, drives it through initialize +
 * notifications/initialized + tools/list, then tears down. We don't
 * make any HN network calls here — those live in the unit suite.
 */
class StdioRpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly rl: ReadlineInterface;
  private readonly pending = new Map<
    number,
    { resolve: (msg: JsonRpcMessage) => void; reject: (err: Error) => void }
  >();
  private nextId = 1;
  public readonly stderr: string[] = [];

  constructor(entry: string) {
    this.child = spawn("node", [entry], { stdio: ["pipe", "pipe", "pipe"] });
    this.rl = createInterface({ input: this.child.stdout });

    this.rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(line) as JsonRpcMessage;
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const cb = this.pending.get(msg.id);
        if (cb) {
          this.pending.delete(msg.id);
          if (msg.error) {
            cb.reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
          } else {
            cb.resolve(msg);
          }
        }
      }
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr.push(chunk.toString());
    });
  }

  send(method: string, params: unknown): Promise<JsonRpcMessage> {
    return new Promise((resolveResp, rejectResp) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rejectResp(new Error(`Timeout waiting for response to ${method}`));
        }
      }, 5_000);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolveResp(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          rejectResp(err);
        },
      });
      const payload: JsonRpcMessage = { jsonrpc: "2.0", id, method, params };
      this.child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  notify(method: string): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    this.child.kill();
    this.rl.close();
    await new Promise<void>((resolveClose) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) {
        resolveClose();
        return;
      }
      this.child.once("exit", () => resolveClose());
      // Safety net in case the process is already gone before listener attaches.
      setTimeout(() => resolveClose(), 1_000);
    });
  }
}

describe.skipIf(!built)("probe integration (built server)", () => {
  const client = new StdioRpcClient(serverEntry);

  afterAll(async () => {
    await client.close();
  });

  it("responds to initialize with the correct serverInfo.name", async () => {
    const init = await client.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0.0.0" },
    });

    const result = init.result as InitializeResult;
    expect(result.serverInfo?.name).toBe("mcp-server-sample");

    // Per MCP handshake: send initialized notification (no response expected).
    client.notify("notifications/initialized");
  });

  it("lists all three HN tools via tools/list", async () => {
    const tools = await client.send("tools/list", {});
    const result = tools.result as ToolListResult;
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual(["hn_get_story", "hn_search", "hn_top_stories"]);
  });

  it("emits the ready banner on stderr", async () => {
    // The banner is written on connect, before the initialize response goes
    // out, but stdout and stderr are independent OS pipes — under load the
    // stdout response can arrive before the stderr chunk. Poll briefly so a
    // slow CI runner doesn't flake.
    const banner = "mcp-server-sample 0.1.0 ready on stdio";
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && !client.stderr.join("").includes(banner)) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(client.stderr.join("")).toContain(banner);
  });
});
