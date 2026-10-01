import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Empaqueta un objeto como resultado de tool MCP (texto JSON legible). Los números no finitos
 * (p. ej. el coste "infinito" de una deuda que nunca se salda) salen como `null`, que es lo que
 * hace `JSON.stringify`: las descripciones de las tools lo explican al cliente.
 */
export function jsonResult(value: unknown, options: { compact?: boolean } = {}): CallToolResult {
  // `compact` evita la sangría en catálogos grandes (el de calculadoras ronda los 40 KB).
  return { content: [{ type: 'text', text: JSON.stringify(value, null, options.compact ? undefined : 2) }] };
}

/** Resultado de tool marcado como error (el host lo muestra al usuario sin romper la sesión). */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
