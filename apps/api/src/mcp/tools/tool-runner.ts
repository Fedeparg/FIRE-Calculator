import { randomUUID } from 'node:crypto';

import { HttpException, Logger } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE } from '../../oauth/oauth.constants.js';
import { McpAuditService } from '../mcp-audit.service.js';
import { errorResult } from '../mcp-results.js';
import { InvalidToolInputError, ToolUserError } from '../tool-errors.js';

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

type ToolScope = typeof SCOPE_PORTFOLIO_READ | typeof SCOPE_PORTFOLIO_WRITE;

/** Mensaje al host cuando el token no tiene el scope que exige la tool (step-up). */
const SCOPE_DENIED_MESSAGES: Record<ToolScope, string> = {
  [SCOPE_PORTFOLIO_READ]:
    'Esta acción requiere permiso de lectura (portfolio:read). Vuelve a conectar la aplicación ' +
    'concediendo acceso de lectura para poder consultar la cartera.',
  [SCOPE_PORTFOLIO_WRITE]:
    'Esta acción requiere permiso de escritura (portfolio:write). Vuelve a conectar la ' +
    'aplicación concediendo acceso de escritura para poder modificar la cartera.',
};

/**
 * Ejecuta el cuerpo de las tools de UNA petición con auditoría y control de scope. Se crea por
 * petición con su contexto, de modo que las tools cierran sobre SU `userId`.
 */
export class ToolRunner {
  private static readonly logger = new Logger('McpTools');

  constructor(
    private readonly ctx: McpContext,
    private readonly audit: McpAuditService,
  ) {}

  get userId(): string {
    return this.ctx.userId;
  }

  /**
   * Ejecuta el cuerpo de una tool de LECTURA: exige `portfolio:read` (que todo token válido
   * tiene, porque `write` lo implica; ver `withImpliedScopes`) y audita. Los errores de dominio
   * se traducen a resultado de error de tool (no a un 500): el host los muestra al usuario.
   */
  run(tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    return this.runWithScope(SCOPE_PORTFOLIO_READ, tool, body);
  }

  /**
   * Igual que `run` pero exige el scope de escritura antes de ejecutar (step-up por-tool). Un
   * token sin `portfolio:write` recibe un error claro y queda registrado como `denied_scope`.
   */
  runWrite(tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    return this.runWithScope(SCOPE_PORTFOLIO_WRITE, tool, body);
  }

  private async runWithScope(
    scope: ToolScope,
    tool: string,
    body: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    const { userId, clientId, scopes } = this.ctx;
    if (!scopes.includes(scope)) {
      await this.audit.record(userId, clientId, tool, 'denied_scope');
      return errorResult(SCOPE_DENIED_MESSAGES[scope]);
    }
    try {
      const result = await body();
      await this.audit.record(userId, clientId, tool, 'ok');
      return result;
    } catch (error) {
      await this.audit.record(userId, clientId, tool, 'error');
      return errorResult(this.toUserMessage(tool, error));
    }
  }

  /**
   * Convierte un error en un mensaje para el host MCP, que lo pasa al LLM y al usuario. Solo
   * se reenvía el texto de los errores PENSADOS para el usuario: los de entrada de las tools y
   * las `HttpException` de Nest (detalle en `response`: string u objeto con `message`/`code`).
   * Cualquier otro error (una consulta de Drizzle con su SQL y parámetros, un fallo de red, un
   * bug) se registra aquí con una referencia y al host solo le llega esa referencia.
   */
  private toUserMessage(tool: string, error: unknown): string {
    if (error instanceof InvalidToolInputError) {
      return `Entrada no válida: ${error.message}`;
    }
    if (error instanceof ToolUserError) {
      return error.message;
    }
    if (error instanceof HttpException) {
      const message = httpExceptionMessage(error);
      if (message) return message;
    }
    const reference = randomUUID();
    ToolRunner.logger.error(
      `Error interno en la tool ${tool} (ref. ${reference})`,
      error instanceof Error ? error.stack : String(error),
    );
    return `Error interno al ejecutar la operación (ref. ${reference}).`;
  }
}

/** Texto de una `HttpException` de Nest (`message` y, si lo hay, el `code` de dominio). */
function httpExceptionMessage(error: HttpException): string | null {
  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const r = response as { message?: unknown; code?: unknown };
  const msg = Array.isArray(r.message) ? r.message.join('; ') : r.message;
  if (typeof msg !== 'string') return null;
  const code = typeof r.code === 'string' || typeof r.code === 'number' ? r.code : undefined;
  return code !== undefined ? `${msg} (${code})` : msg;
}
