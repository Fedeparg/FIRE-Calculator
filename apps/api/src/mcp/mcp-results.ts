import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Resultado de tool MCP como texto JSON. Los no finitos salen como `null` (`JSON.stringify`); las descripciones de las tools lo explican. */
export function jsonResult(value: unknown, options: { compact?: boolean } = {}): CallToolResult {
  // `compact`: catálogos grandes (el de calculadoras ronda los 40 KB).
  return { content: [{ type: 'text', text: JSON.stringify(value, null, options.compact ? undefined : 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
