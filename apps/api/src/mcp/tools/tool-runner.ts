import { randomUUID } from 'node:crypto';

import { HttpException, Logger } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { DomainError, domainErrorToHttp } from '../../common/domain-error.js';
import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE } from '../../oauth/oauth.constants.js';
import type { McpAuditService } from '../mcp-audit.service.js';
import { errorResult } from '../mcp-results.js';
import { InvalidToolInputError, ToolUserError } from '../tool-errors.js';

/**
 * Security context of an MCP request, derived from the verified access token. The `userId` is
 * what makes every tool return only its owner's data (same isolation principle as `positions`
 * with the JWT). See `_local/mcp-integracion.md`.
 */
export type McpContext = {
  userId: string;
  clientId: string;
  scopes: string[];
};

type ToolScope = typeof SCOPE_PORTFOLIO_READ | typeof SCOPE_PORTFOLIO_WRITE;

/** Message to the host when the token lacks the scope the tool requires (step-up). */
const SCOPE_DENIED_MESSAGES: Record<ToolScope, string> = {
  [SCOPE_PORTFOLIO_READ]:
    'Esta acción requiere permiso de lectura (portfolio:read). Vuelve a conectar la aplicación ' +
    'concediendo acceso de lectura para poder consultar la cartera.',
  [SCOPE_PORTFOLIO_WRITE]:
    'Esta acción requiere permiso de escritura (portfolio:write). Vuelve a conectar la ' +
    'aplicación concediendo acceso de escritura para poder modificar la cartera.',
};

/**
 * Runs the tool bodies of ONE request with auditing and scope control. It is created per request
 * with its context, so the tools close over THEIR `userId`.
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
   * Runs the body of a READ tool: requires `portfolio:read` (which every valid token has, because
   * `write` implies it; see `withImpliedScopes`) and audits. Domain errors are turned into a tool
   * error result (not a 500): the host shows them to the user.
   */
  run(tool: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
    return this.runWithScope(SCOPE_PORTFOLIO_READ, tool, body);
  }

  /**
   * Like `run`, but requires the write scope before running (per-tool step-up). A token without
   * `portfolio:write` gets a clear error and is logged as `denied_scope`.
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
   * Turns an error into a message for the MCP host, which passes it on to the LLM and the user.
   * Only the text of errors MEANT for the user is forwarded: tool input errors, Nest
   * `HttpException`s (detail in `response`: a string or an object with `message`/`code`) and domain
   * errors (`DomainError`), with the same translation as REST.
   * Any other error (a Drizzle query with its SQL and parameters, a network failure, a bug) is
   * logged here with a reference, and only that reference reaches the host.
   */
  private toUserMessage(tool: string, error: unknown): string {
    if (error instanceof InvalidToolInputError) {
      return `Entrada no válida: ${error.message}`;
    }
    if (error instanceof ToolUserError) {
      return error.message;
    }
    const http = error instanceof DomainError ? domainErrorToHttp(error) : error;
    if (http instanceof HttpException) {
      const message = httpExceptionMessage(http);
      if (message) return message;
    }
    const reference = randomUUID();
    ToolRunner.logger.error(
      `Internal error in tool ${tool} (ref. ${reference})`,
      error instanceof Error ? error.stack : String(error),
    );
    return `Error interno al ejecutar la operación (ref. ${reference}).`;
  }
}

/** Text of a Nest `HttpException` (`message` and, if present, the domain `code`). */
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
