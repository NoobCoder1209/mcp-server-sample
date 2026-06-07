#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "mcp-server-sample",
  version: "0.1.0",
});

registerTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-sample 0.1.0 ready on stdio");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
