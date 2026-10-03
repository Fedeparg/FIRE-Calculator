import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** MCP tool result as JSON text. Non-finite numbers come out as `null` (`JSON.stringify`); the tool descriptions say so. */
export function jsonResult(value: unknown, options: { compact?: boolean } = {}): CallToolResult {
  // `compact`: large catalogues (the calculator one is around 40 KB).
  return { content: [{ type: 'text', text: JSON.stringify(value, null, options.compact ? undefined : 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
