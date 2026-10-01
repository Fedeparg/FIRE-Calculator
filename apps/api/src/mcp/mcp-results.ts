import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Empaqueta un objeto como resultado de tool MCP (texto JSON legible). Los números no finitos
 * (p. ej. el coste "infinito" de una deuda que nunca se salda) salen como `null`, que es lo que
 * hace `JSON.stringify`: las descripciones de las tools lo explican al cliente.
 */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Resultado de tool marcado como error (el host lo muestra al usuario sin romper la sesión). */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Ejecuta el cuerpo de una tool con auditoría y traducción de errores (ver `McpService.run`). */
export type ToolRunner = (
  tool: string,
  body: () => Promise<CallToolResult>,
) => Promise<CallToolResult>;
