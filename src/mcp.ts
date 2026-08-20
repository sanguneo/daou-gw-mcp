#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SERVER_INFO, callTool, listTools } from './surfaces/mcp.js';

export function createServer(): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> =>
    callTool(request.params.name, request.params.arguments),
  );
  return server;
}

export async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

const entry = process.argv[1] ?? '';
if (/mcp\.(js|ts)$/.test(entry)) void main();
