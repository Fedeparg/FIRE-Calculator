import { createHash, randomBytes } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { mcpAuditLog, oauthTokens, positions } from '../db/schema.js';
import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE } from '../oauth/oauth.constants.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { disableStartupBackfill, waitForStartupJobs } from '../../test/startup-jobs.js';
import { mountMcp } from './mount-mcp.js';

/**
 * `AppModule` se importa en diferido: `ConfigModule.forRoot({ validate })` valida el entorno al
 * evaluar el módulo, y estos tests fijan el suyo en `beforeAll`, es decir, después de los imports.
 */
const loadAppModule = async () => (await import('../app.module.js')).AppModule;

const APP_URL = 'https://sextante.example.test';
/** Audiencia canónica de los tokens: `<issuer>/api/mcp`. */
const AUDIENCE = `${APP_URL}/api/mcp`;
const CLIENT_ID = 'cliente-de-prueba';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/**
 * Prueba el montaje real del servidor MCP (`mountMcp`) sobre la aplicación completa: la capa
 * Bearer, el descubrimiento OAuth, el CORS y el control de scope por tool. Los tests de
 * `McpService` instancian el servicio a mano y no ven nada de esto.
 */
describe('mountMcp (HTTP)', () => {
  const original = { ...process.env };
  let app: NestExpressApplication;
  let origin: string;
  let db: Database;
  let closeDb: () => Promise<void>;
  let userId: string;

  /** Inserta un token de acceso (solo se guarda su hash, como en producción). */
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

  /** POST JSON-RPC a `/api/mcp`. Sin `token`, no envía `Authorization`. */
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

  /** Llama a una tool y devuelve su resultado (la respuesta llega como SSE o como JSON). */
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
    if (!message.result) throw new Error(`Respuesta JSON-RPC sin result: ${text}`);
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
    // Los crons no deben interbloquearse con el TRUNCATE de `resetDb` (ver imports.controller.test).
    process.env.PRICE_REFRESH_CRON = '0 0 4 1 1 *';
    process.env.PRICE_INTRADAY_CRON = 'off';

    ({ db, close: closeDb } = createTestDb());
    disableStartupBackfill();

    // Mismo orden que `main.ts`: cookieParser antes de `mountMcp`, y este antes de escuchar.
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

  describe('autenticación Bearer', () => {
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    };

    /** Comprueba el 401 con el reto de descubrimiento OAuth (RFC 9728) en `WWW-Authenticate`. */
    const expectBearerChallenge = (res: Response): void => {
      expect(res.status).toBe(401);
      const challenge = res.headers.get('www-authenticate') ?? '';
      expect(challenge).toMatch(/^Bearer /);
      expect(challenge).toContain('error="invalid_token"');
      // Apunta a la metadata del recurso, sobre el origen público (no sobre `127.0.0.1`).
      expect(challenge).toContain(`resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/api/mcp"`);
    };

    it('devuelve 401 con el reto WWW-Authenticate si no hay token', async () => {
      const res = await mcpPost(initialize);

      expectBearerChallenge(res);
      expect(await res.json()).toMatchObject({ error: 'invalid_token' });
    });

    it('devuelve 401 con un token desconocido', async () => {
      expectBearerChallenge(await mcpPost(initialize, 'token-que-no-existe'));
    });

    it('devuelve 401 con un token caducado', async () => {
      const token = await issueAccessToken({ expiresAt: new Date(Date.now() - 1_000) });

      expectBearerChallenge(await mcpPost(initialize, token));
    });

    it('devuelve 401 con un token emitido para otra audiencia', async () => {
      const token = await issueAccessToken({ audience: 'https://otro-recurso.example.test/api/mcp' });

      expectBearerChallenge(await mcpPost(initialize, token));
    });

    it('devuelve 401 si se presenta un refresh token como access token', async () => {
      const token = await issueAccessToken({ type: 'refresh' });

      expectBearerChallenge(await mcpPost(initialize, token));
    });

    it('devuelve 401 con un esquema de autorización que no es Bearer', async () => {
      const res = await fetch(`${origin}/api/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic dXNlcjpwYXNz' },
        body: JSON.stringify(initialize),
      });

      expect(res.status).toBe(401);
    });

    it('acepta un token válido y atiende el initialize', async () => {
      const token = await issueAccessToken();

      const res = await mcpPost(initialize, token);

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('"serverInfo"');
    });

    it('el 401 lleva cabeceras CORS para que un cliente de navegador pueda leer el reto', async () => {
      const res = await fetch(`${origin}/api/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://inspector.example.test' },
        body: JSON.stringify(initialize),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://inspector.example.test');
      expect(res.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
    });

    it('responde al preflight OPTIONS con 204 sin exigir token', async () => {
      const res = await fetch(`${origin}/api/mcp`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://inspector.example.test', 'Access-Control-Request-Method': 'POST' },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    });

    it('responde 405 (no 404) a GET y DELETE: el servidor es sin estado y solo admite POST', async () => {
      expect((await fetch(`${origin}/api/mcp`)).status).toBe(405);
      expect((await fetch(`${origin}/api/mcp`, { method: 'DELETE' })).status).toBe(405);
    });
  });

  describe('discovery OAuth', () => {
    it('publica la metadata del recurso protegido (RFC 9728)', async () => {
      const res = await fetch(`${origin}/.well-known/oauth-protected-resource/api/mcp`);

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        resource: AUDIENCE,
        authorization_servers: [`${APP_URL}/`],
        scopes_supported: [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE],
        resource_name: 'Sextante',
      });
    });

    it('publica la metadata del servidor de autorización (RFC 8414) con PKCE S256 y registro dinámico', async () => {
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

    it('el discovery es público: no exige token', async () => {
      const res = await fetch(`${origin}/.well-known/oauth-authorization-server`, {
        headers: { Authorization: 'Bearer basura' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('scope por tool', () => {
    it('un token de solo lectura puede usar tools de lectura (auditoría ok)', async () => {
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_READ] });

      const result = await callTool(token, 'list_positions');

      expect(result.isError).toBeFalsy();
      expect(await auditRows()).toEqual([{ tool: 'list_positions', outcome: 'ok', clientId: CLIENT_ID }]);
    });

    it('un token de solo lectura no puede usar tools de escritura: isError, denied_scope y sin efecto', async () => {
      const [position] = await db
        .insert(positions)
        .values({ userId, ticker: 'IWDA', quantity: '1', avgPrice: '100', broker: '' })
        .returning({ id: positions.id });
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_READ] });

      const result = await callTool(token, 'delete_position', { id: position.id });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('portfolio:write');
      expect(await auditRows()).toEqual([{ tool: 'delete_position', outcome: 'denied_scope', clientId: CLIENT_ID }]);
      // La posición sigue ahí: el rechazo ocurre antes de ejecutar nada.
      expect(await db.select().from(positions).where(eq(positions.id, position.id))).toHaveLength(1);
    });

    it('un token con portfolio:write sí puede usar tools de escritura', async () => {
      const [position] = await db
        .insert(positions)
        .values({ userId, ticker: 'IWDA', quantity: '1', avgPrice: '100', broker: '' })
        .returning({ id: positions.id });
      const token = await issueAccessToken({ scopes: [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE] });

      const result = await callTool(token, 'delete_position', { id: position.id });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text)).toEqual({ deleted: true, id: position.id });
      expect(await auditRows()).toEqual([{ tool: 'delete_position', outcome: 'ok', clientId: CLIENT_ID }]);
      expect(await db.select().from(positions).where(eq(positions.id, position.id))).toHaveLength(0);
    });
  });
});
