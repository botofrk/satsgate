import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'satsgate',
    version: '0.4.0',
  });

  registerTools(server);

  return server;
}
