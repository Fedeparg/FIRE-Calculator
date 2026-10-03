import { createHash, randomBytes } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { mcpAuditLog, oauthTokens, positions } from '../db/schema.js';
import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE } from '../oauth/oauth.constants.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { disableStartupBackfill, waitForStartupJobs } from '../../test/startup-jobs.js';
import { mountMcp } from './mount-mcp.js';

/**
 * `AppModule` is imported lazily: `ConfigModule.forRoot({ validate })` validates the environment when
 * the module is evaluated, and these tests set theirs in `beforeAll`, i.e. after the imports.
 */
const loadAppModule = async () => (await import('../app.module.js')).AppModule;

const APP_URL = 'https://sextante.example.test';
/** Canonical token audience: `<issuer>/api/mcp`. */
const AUDIENCE = `${APP_URL}/api/mcp`;
const CLIENT_ID = 'cliente-de-prueba';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/**
 * Tests the real mounting of the MCP server (`mountMcp`) on the full application: the Bearer layer,
 * OAuth discovery, CORS and per-tool scope control. The `McpService` tests build the service by
 * hand and see none of this.
 */
describe('mountMcp (HTTP)', () => {
  const original = { ...process.env };
  let app: NestExpressApplication;
  let origin: string;
  let db: Database;
  let closeDb: () => Promise<void>;
  let userId: string;

  /** Inserts an access token (only its hash is stored, as in production). */
  const issueAccessToken = async (
    options: {
      scopes?: string[];
      expiresAt?: Date;
      audience?: string;
      type?: 'access' | 'refresh';
    } = {},
  ): Promise<string> => {
    const token = randomBytes(32).toString('base64url');
    await db.insert(oauthTokens).values({
      tokenHash: sha256(token),
      type: options.type ?? 'access',
      userId,
      clientId: CLIENT_ID,
      scopes: options.scopes ?? [SCOPE_PORTFOLIO_READ],
      audience: options.audience ?? AUDIENCE,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    });
    return token;
  };

  /** JSON-RPC POST to `/api/mcp`. Without `token`, no `Authorization` is sent. */
  const mcpPost = (body: unknown, token?: string): Promise<Response> =>
    fetch(`${origin}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  /** Calls a tool and returns its result (the response arrives as SSE or as JSON). */
  const callTool = async (token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> => {
    const res = await mcpPost(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      token,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const payload = res.headers.get('content-type')?.includes('text/event-stream')
      ? (text.split('\n').find((line) => line.startsWith('data:')) ?? '').slice('data:'.length)
      : text;
    const message = JSON.parse(payload) as { result?: ToolResult; error?: { message: string } };
    if (!message.result) throw new Error(`JSON-RPC response without result: ${text}`);
    return message.result;
  };

  const auditRows = (): Promise<{ tool: string; outcome: string; clientId: string | null }[]> =>
    db
      .select({ tool: mcpAuditLog.tool, outcome: mcpAuditLog.outcome, clientId: mcpAuditLog.clientId })
      .from(mcpAuditLog);

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.JWT_SECRET = 'test-secret-para-mount-mcp';
    process.env.EMAIL_TRANSPORT = 'dev';
    process.env.EMAIL_FROM = 'Sextante <no-reply@example.test>';
    process.env.APP_URL = APP_URL;
    // The crons must not deadlock with `resetDb`'s TRUNCATE (see imports.controller.test).
    process.env.PRICE_REFRESH_CRON = '0 0 4 1 1 *';
    process.env.PRICE_INTRADAY_CRON = 'off';

    ({ db, close: closeDb } = createTestDb());
    disableStartupBackfill();

    // Same order as `main.ts`: cookieParser before `mountMcp`, and that before listening.
    app = await NestFactory.create<NestExpressApplication>(await loadAppModule(), {
      abortOnError: false,
      logger: false,
    });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    mountMcp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    await waitForStartupJobs(app);
  });

  beforeEach(async () => {
    await resetDb(db);
    userId = await insertUser(db, 'a@example.com');
  });

  afterAll(async () => {
    await app.close();
    await resetDb(db);
    await closeDb();
    process.env = original;
  });

  describe('Bearer authentication', () => {
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    };

    /** Checks the 401 with the OAuth discovery challenge (RFC 9728) in `WWW-Authenticate`. */
    const expectBearerChallenge = (res: Response): void => {
      expect(res.status).toBe(401);
      const challenge = res.headers.get('www-authenticate') ?? '';
      expect(challenge).toMatch(/^Bearer /);
      expect(challenge).toContain('error="invalid_token"');
      // Points to the resource metadata, on the public origin (not on `127.0.0.1`).
      expect(challenge).toContain(`resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/api/mcp"`);
    };

    it('returns 401 with the WWW-Authenticate challenge when there is no token', async () => {
      const res = await mcpPost(initialize);

      expectBearerChallenge(res);
      expect(await res.json()).toMatchObject({ error: 'invalid_token' });
    });

    it('returns 401 for an unknown token', async () => {
      expectBearerChallenge(await mcpPost(initialize, 'token-que-no-existe'));
    });

    it('returns 401 for an expired token', async () => {
      const token = await issueAccessToken({ expiresAt: new Date(Date.now() - 1_000) });

      expectBearerChallenge(await mcpPost(initialize, token));
    });

    it('returns 401 for a token issued for another audience', async () => {
      const token = await issueAccessToken({ audience: 'https://other-resource.example.test/api/mcp' });

      expectBearerChallenge(await mcpPost(initialize, token));
    });

    it('returns 401 when a refresh token is presented as an access token', async () => {
      const token = await issueAccessToken({ type: 'refresh' });

      expectBearerChallenge(await mcpPost(initialize, token));
    });

    it('returns 401 for an authorization scheme other than Bearer', async () => {
      const res = await fetch(`${origin}/api/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic dXNlcjpwYXNz' },
        body: JSON.stringify(initialize),
      });

      expect(res.status).toBe(401);
    });

    it('accepts a valid token and serves initialize', async () => {
      const token = await issueAccessToken();

      const res = await mcpPost(initialize, token);

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('"serverInfo"');
    });

    it('the 401 carries CORS headers so a browser client can read the challenge', async () => {
      const res = await fetch(`${origin}/api/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://inspector.example.test' },
        body: JSON.stringify(initialize),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://inspector.example.test');
      expect(res.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
    });

    it('answers the OPTIONS preflight with 204 without requiring a token', async () => {
      const res = await fetch(`${origin}/api/mcp`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://inspector.example.test', 'Access-Control-Request-Method': 'POST' },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    });

    it('answers 405 (not 404) to GET and DELETE: the server is stateless and only accepts POST', async () => {
      expect((await fetch(`${origin}/api/mcp`)).status).toBe(405);
      expect((await fetch(`${origin}/api/mcp`, { method: 'DELETE' })).status).toBe(405);
    });
  });

  describe('OAuth discovery', () => {
    it('publishes the protected resource metadata (RFC 9728)', async () => {
      const res = await fetch(`${origin}/.well-known/oauth-protected-resource/api/mcp`);

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        resource: AUDIENCE,
        authorization_servers: [`${APP_URL}/`],
        scopes_supported: [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE],
        resource_name: 'Sextante',
      });
    });

    it('publishes the authorization server metadata (RFC 8414) with PKCE S256 and dynamic registration', async () => {
      const res = await fetch(`${origin}/.well-known/oauth-authorization-server`);

      expect(res.status).toBe(200);
      const metadata = (await res.json()) as Record<string, unknown>;
      expect(metadata).toMatchObject({
        issuer: `${APP_URL}/`,
        authorization_endpoint: `${APP_URL}/authorize`,
        token_endpoint: `${APP_URL}/token`,
        registration_endpoint: `${APP_URL}/register`,
        revocation_endpoint: `${APP_URL}/revoke`,
        scopes_supported: [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE],
        code_challenge_methods_supported: ['S256'],
      });
      expect(metadata.response_types_supported).toEqual(['code']);
      expect(metadata.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token']));
    });

    it('discovery is public: no token required', async () => {
      const res = await fetch(`${origin}/.well-known/oauth-authorization-server`, {
        headers: { Authorization: 'Bearer basura' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('per-tool scope', () => {
    it('a read-only token can use read tools (audit ok)', async () => {
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_READ] });

      const result = await callTool(token, 'list_positions');

      expect(result.isError).toBeFalsy();
      expect(await auditRows()).toEqual([{ tool: 'list_positions', outcome: 'ok', clientId: CLIENT_ID }]);
    });

    it('a read-only token cannot use write tools: isError, denied_scope and no effect', async () => {
      const position = firstItem(
        await db
          .insert(positions)
          .values({ userId, ticker: 'IWDA', quantity: '1', avgPrice: '100', broker: '' })
          .returning({ id: positions.id }),
      );
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_READ] });

      const result = await callTool(token, 'delete_position', { id: position.id });

      expect(result.isError).toBe(true);
      expect(itemAt(result.content, 0).text).toContain('portfolio:write');
      expect(await auditRows()).toEqual([{ tool: 'delete_position', outcome: 'denied_scope', clientId: CLIENT_ID }]);
      // The position is still there: the rejection happens before anything runs.
      expect(await db.select().from(positions).where(eq(positions.id, position.id))).toHaveLength(1);
    });

    it('portfolio:write implies portfolio:read: a token issued with write only can also read', async () => {
      // "Legacy" token (issued before the rule): verification applies `withImpliedScopes`.
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_WRITE] });

      const result = await callTool(token, 'list_positions');

      expect(result.isError).toBeFalsy();
      expect(await auditRows()).toEqual([{ tool: 'list_positions', outcome: 'ok', clientId: CLIENT_ID }]);
    });

    it('a token without portfolio:read cannot use read tools: isError and denied_scope', async () => {
      const token = await issueAccessToken({ scopes: [] });

      const result = await callTool(token, 'list_positions');

      expect(result.isError).toBe(true);
      expect(itemAt(result.content, 0).text).toContain('portfolio:read');
      expect(await auditRows()).toEqual([{ tool: 'list_positions', outcome: 'denied_scope', clientId: CLIENT_ID }]);
    });

    it('a token with portfolio:write can use write tools', async () => {
      const position = firstItem(
        await db
          .insert(positions)
          .values({ userId, ticker: 'IWDA', quantity: '1', avgPrice: '100', broker: '' })
          .returning({ id: positions.id }),
      );
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE] });

      const result = await callTool(token, 'delete_position', { id: position.id });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(itemAt(result.content, 0).text)).toEqual({ deleted: true, id: position.id });
      expect(await auditRows()).toEqual([{ tool: 'delete_position', outcome: 'ok', clientId: CLIENT_ID }]);
      expect(await db.select().from(positions).where(eq(positions.id, position.id))).toHaveLength(0);
    });
  });
});
