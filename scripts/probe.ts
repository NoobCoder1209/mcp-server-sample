/**
 * Local probe: spawns the built MCP server, performs the JSON-RPC handshake,
 * lists tools, then calls hn_search for "Anthropic". Prints output to stdout.
 *
 * Usage: pnpm build && pnpm probe
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, "..", "dist", "index.js");

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

const child = spawn("node", [serverEntry], {
  stdio: ["pipe", "pipe", "inherit"],
});

const rl = createInterface({ input: child.stdout });
const pending = new Map<number, { resolve: (msg: JsonRpcMessage) => void; reject: (err: Error) => void }>();
let nextId = 1;

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: JsonRpcMessage;
  try {
    msg = JSON.parse(line) as JsonRpcMessage;
  } catch {
    console.error("probe: non-JSON line from server:", line);
    return;
  }
  if (typeof msg.id === "number") {
    const cb = pending.get(msg.id);
    if (cb) {
      pending.delete(msg.id);
      if (msg.error) {
        cb.reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        cb.resolve(msg);
      }
    }
  }
});

function send(method: string, params: unknown): Promise<JsonRpcMessage> {
  return new Promise((resolveResp, rejectResp) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rejectResp(new Error(`Timeout waiting for response to ${method}`));
      }
    }, 12_000);
    pending.set(id, {
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
    child.stdin.write(JSON.stringify(payload) + "\n");
  });
}

async function main(): Promise<void> {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "probe", version: "0.0.0" },
  });
  console.log("--- initialize ---");
  console.log(JSON.stringify(init.result, null, 2));

  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );

  const tools = await send("tools/list", {});
  console.log("\n--- tools/list ---");
  const toolNames = (tools.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
  console.log(toolNames.join(", "));

  const search = await send("tools/call", {
    name: "hn_search",
    arguments: { query: "Anthropic", limit: 5 },
  });
  console.log('\n--- tools/call hn_search { query: "Anthropic", limit: 5 } ---');
  const out = (search.result as { content: Array<{ text: string }> }).content[0]?.text;
  console.log(out);

  child.stdin.end();
  child.kill();
}

main()
  .catch((err) => {
    console.error("probe failed:", err);
    child.kill();
    process.exit(1);
  })
  .finally(() => {
    rl.close();
  });
