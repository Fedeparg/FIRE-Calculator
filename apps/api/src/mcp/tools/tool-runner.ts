import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { SCOPE_PORTFOLIO_WRITE } from '../../oauth/oauth.constants.js';
import { McpAuditService } from '../mcp-audit.service.js';
import { errorResult } from '../mcp-results.js';

/**
 * Contexto de seguridad de una petición MCP, derivado del access token verificado. El
 * `userId` es lo que hace que toda tool devuelva solo los datos de su dueño (mismo principio
 * de aislamiento que `positions` con el JWT). Ver `_local/mcp-integracion.md`.
 */
export type McpContext = {
  userId: string;
  clientId: string;
  scopes: string[];
};

/** Error de validación de entrada de tool (se traduce a resultado de error de tool). */
export class InvalidToolInputError extends Error {}

/**
 * Ejecuta el cuerpo de las tools de UNA petición con auditoría y control de scope. Se crea por
 * petición con su contexto, de modo que las tools cierran sobre SU `userId`.
 */
export class ToolRunner {
  constructor(
    private readonly ctx: McpContext,
    private readonly audit: McpAuditService,
  ) {}

  get userId(): string {
    return this.ctx.userId;
  }

  /**
   * Ejecuta el cuerpo de una tool de LECTURA con auditoría. Los errores de dominio se
   * traducen a resultado de error de tool (no a un 500): el host los muestra al usuario.
   */
  async run(tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    const { userId, clientId } = this.ctx;
    try {
      const result = await body();
      await this.audit.record(userId, clientId, tool, 'ok');
      return result;
    } catch (error) {
      await this.audit.record(userId, clientId, tool, 'error');
      return errorResult(toUserMessage(error));
    }
  }

  /**
   * Igual que `run` pero exige el scope de escritura antes de ejecutar (step-up por-tool). Un
   * token sin `portfolio:write` recibe un error claro y queda registrado como `denied_scope`.
   */
  async runWrite(tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    if (!this.ctx.scopes.includes(SCOPE_PORTFOLIO_WRITE)) {
      await this.audit.record(this.ctx.userId, this.ctx.clientId, tool, 'denied_scope');
      return errorResult(
        'Esta acción requiere permiso de escritura (portfolio:write). Vuelve a conectar la ' +
          'aplicación concediendo acceso de escritura para poder modificar la cartera.',
      );
    }
    return this.run(tool, body);
  }
}

/**
 * Convierte un error (de validación o de dominio de NestJS) en un mensaje legible para el
 * host MCP. Las `HttpException` de Nest llevan el detalle en `response` (string u objeto con
 * `message`/`code`); lo extraemos sin volcar trazas internas.
 */
function toUserMessage(error: unknown): string {
  if (error instanceof InvalidToolInputError) {
    return `Entrada no válida: ${error.message}`;
  }
  const response = (error as { response?: unknown })?.response;
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    const r = response as { message?: unknown; code?: unknown };
    const msg = Array.isArray(r.message) ? r.message.join('; ') : r.message;
    if (typeof msg === 'string') {
      const code = typeof r.code === 'string' || typeof r.code === 'number' ? r.code : undefined;
      return code !== undefined ? `${msg} (${code})` : msg;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Error al ejecutar la operación';
}
