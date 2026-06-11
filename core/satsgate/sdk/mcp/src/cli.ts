#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const apiKey = process.env.SATSGATE_API_KEY;
  if (!apiKey) {
    console.error('Error: SATSGATE_API_KEY environment variable is required');
    console.error('');
    console.error('Usage:');
    console.error('  SATSGATE_API_KEY=your_key satsgate-mcp');
    console.error('');
    console.error('Optional:');
    console.error('  SATSGATE_BASE_URL=https://api.aipp.dev  (default)');
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
