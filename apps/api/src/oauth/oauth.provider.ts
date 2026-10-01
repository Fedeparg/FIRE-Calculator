import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { oauthAuthCodes, oauthTokens } from '../db/schema.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { OAuthUrls } from './oauth-urls.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  SCOPE_PORTFOLIO_READ,
  SCOPES_SUPPORTED,
} from './oauth.constants.js';

type SessionJwt = { sub: string; email: string };

/**
 * Authorization Server de Sextante para MCP, implementando la interfaz `OAuthServerProvider`
 * del SDK oficial. El SDK monta los endpoints HTTP (`/authorize`, `/token`, `/register`,
 * `/revoke`, discovery, PRM) y valida PKCE; NOSOTROS implementamos la lógica y EMITIMOS los
 * tokens. Ver `_local/mcp-integracion.md`.
 *
 * Invariantes de seguridad que poseemos (no las cubre el SDK):
 *  - Códigos y tokens SOLO se guardan hasheados (SHA-256), nunca en claro.
 *  - Códigos de un solo uso atómico (`UPDATE … WHERE consumedAt IS NULL … RETURNING`).
 *  - Audience binding (RFC 8707): el token se emite y se VERIFICA contra el URI canónico
 *    `…/api/mcp`; un token para otro recurso se rechaza.
 *  - `authorize()` exige sesión iniciada (cookie del magic link) y consentimiento previo.
 *  - Refresh con rotación + detección de reuso (revoca la cadena).
 */
@Injectable()
export class SextanteOAuthProvider implements OAuthServerProvider {
  private readonly logger = new Logger(SextanteOAuthProvider.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly urls: OAuthUrls,
    private readonly clients: OAuthClientsStore,
    private readonly grants: OAuthGrantsService,
  ) {}

  get clientsStore(): OAuthClientsStore {
    return this.clients;
  }

  /**
   * Inicio del flujo de autorización (navegador). Tres caminos:
   *  1. Sin sesión → redirige al login, que vuelve a esta misma URL de `/authorize`.
   *  2. Con sesión pero sin consentimiento → redirige a la pantalla de consentimiento, que
   *     tras aprobar vuelve a esta misma URL.
   *  3. Con sesión y consentimiento → emite el código y redirige al cliente.
   */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // RFC 8707: el token debe ir destinado a NUESTRO servidor MCP.
    const audience = this.validateResource(params.resource);
    const scopes = this.effectiveScopes(params.scopes);

    const req = res.req;
    const userId = await this.readSession(req);
    if (!userId) {
      const here = this.currentUrl(req);
      const loginUrl = new URL('/entrar', this.urls.issuer);
      loginUrl.searchParams.set('returnTo', here.pathname + here.search);
      res.redirect(loginUrl.href);
      return;
    }

    const consented = await this.grants.hasConsent(userId, client.client_id, scopes);
    if (!consented) {
      const here = this.currentUrl(req);
      const consentUrl = new URL('/oauth/consent', this.urls.issuer);
      consentUrl.searchParams.set('client_id', client.client_id);
      consentUrl.searchParams.set('scope', scopes.join(' '));
      // La query original de `/authorize`, para reanudar el flujo en NUESTRO origen tras
      // aprobar (no es un redirect abierto: el host se fija a nuestro issuer).
      consentUrl.searchParams.set('authorize_params', here.search.replace(/^\?/, ''));
      res.redirect(consentUrl.href);
      return;
    }

    const code = this.randomToken();
    await this.db.insert(oauthAuthCodes).values({
      codeHash: this.hash(code),
      userId,
      clientId: client.client_id,
      scopes,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      resource: audience,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    });

    const target = new URL(params.redirectUri);
    target.searchParams.set('code', code);
    if (params.state !== undefined) {
      target.searchParams.set('state', params.state);
    }
    res.redirect(target.href);
  }

  /** Devuelve el `code_challenge` del código (el SDK lo usa para validar PKCE). No consume. */
  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const [row] = await this.db
      .select({ codeChallenge: oauthAuthCodes.codeChallenge })
      .from(oauthAuthCodes)
      .where(
        and(
          eq(oauthAuthCodes.codeHash, this.hash(authorizationCode)),
          isNull(oauthAuthCodes.consumedAt),
          gt(oauthAuthCodes.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) {
      throw new InvalidGrantError('Authorization code invalid, expired, or already used');
    }
    return row.codeChallenge;
  }

  /** Canjea el código por tokens. El SDK ya validó PKCE; aquí consumimos el código (atómico). */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const [code] = await this.db
      .update(oauthAuthCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(oauthAuthCodes.codeHash, this.hash(authorizationCode)),
          isNull(oauthAuthCodes.consumedAt),
          gt(oauthAuthCodes.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!code) {
      throw new InvalidGrantError('Authorization code invalid, expired, or already used');
    }
    if (code.clientId !== client.client_id) {
      throw new InvalidGrantError('Authorization code was not issued to this client');
    }
    if (redirectUri !== undefined && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    }
    // La audiencia del token = la solicitada en `/authorize` (canónica). Si el `/token`
    // incluye `resource`, debe coincidir.
    const audience = this.validateResource(resource);
    if (code.resource && code.resource !== audience) {
      throw new InvalidTargetError('resource does not match the authorization request');
    }

    const tokens = await this.issueTokens(code.userId, code.clientId, code.scopes, audience);
    await this.grants.touch(code.userId, code.clientId);
    this.touchClient(code.clientId);
    return tokens;
  }

  /** Canjea un refresh token por uno nuevo (rotación + detección de reuso). */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const refreshHash = this.hash(refreshToken);
    const [row] = await this.db
      .select()
      .from(oauthTokens)
      .where(and(eq(oauthTokens.tokenHash, refreshHash), eq(oauthTokens.type, 'refresh')))
      .limit(1);

    if (!row) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    if (row.clientId !== client.client_id) {
      throw new InvalidGrantError('Refresh token was not issued to this client');
    }
    if (row.consumedAt) {
      // Reuso de un refresh ya rotado: posible robo → revoca toda la cadena del cliente.
      this.logger.warn(`Refresh token reuse detected (user=${row.userId}, client=${row.clientId}); revoking`);
      await this.grants.revoke(row.userId, row.clientId);
      throw new InvalidGrantError('Refresh token reuse detected; access revoked');
    }
    if (row.expiresAt < new Date()) {
      throw new InvalidGrantError('Refresh token expired');
    }

    // Consumo atómico: si otra petición lo consumió primero, trátalo como reuso.
    const [consumed] = await this.db
      .update(oauthTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(oauthTokens.tokenHash, refreshHash), isNull(oauthTokens.consumedAt)))
      .returning({ tokenHash: oauthTokens.tokenHash });
    if (!consumed) {
      await this.grants.revoke(row.userId, row.clientId);
      throw new InvalidGrantError('Refresh token reuse detected; access revoked');
    }

    // Solo se pueden estrechar scopes en el refresh, nunca ampliarlos.
    let nextScopes = row.scopes;
    if (scopes && scopes.length > 0) {
      const granted = new Set(row.scopes);
      if (!scopes.every((scope) => granted.has(scope))) {
        throw new InvalidScopeError('Requested scopes exceed the original grant');
      }
      nextScopes = scopes;
    }

    const audience = this.validateResource(resource);
    this.touchClient(row.clientId);
    return this.issueTokens(row.userId, row.clientId, nextScopes, audience, refreshHash);
  }

  /**
   * Verifica un access token (lo llama `requireBearerAuth`). Resuelve el Bearer → AuthInfo
   * con el `userId` en `extra` (lo que usan las tools para scopear). BARRERA Nº1 anti-leakage:
   * rechaza si la audiencia no es nuestro URI canónico (token emitido para otro recurso).
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const [row] = await this.db
      .select()
      .from(oauthTokens)
      .where(and(eq(oauthTokens.tokenHash, this.hash(token)), eq(oauthTokens.type, 'access')))
      .limit(1);

    if (!row) {
      throw new InvalidTokenError('Token not found');
    }
    if (row.expiresAt < new Date()) {
      throw new InvalidTokenError('Token expired');
    }
    if (row.audience !== this.urls.audience) {
      throw new InvalidTokenError('Token audience mismatch');
    }

    return {
      token,
      clientId: row.clientId,
      scopes: row.scopes,
      expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
      resource: new URL(row.audience),
      extra: { userId: row.userId },
    };
  }

  /** Revoca un token concreto (access o refresh) de este cliente. Idempotente. */
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await this.db
      .delete(oauthTokens)
      .where(and(eq(oauthTokens.tokenHash, this.hash(request.token)), eq(oauthTokens.clientId, client.client_id)));
  }

  /* --------------------------------- helpers -------------------------------- */

  /**
   * Marca el cliente como usado (columna `lastUsedAt`, que el reaper usa para no purgar
   * clientes vivos). Deliberadamente SIN `await`: es telemetría, no parte del contrato del
   * canje, así que no debe sumar latencia a `/token` ni hacer fallar la emisión si el UPDATE
   * falla. Un error solo se registra.
   */
  private touchClient(clientId: string): void {
    void this.clients.touch(clientId).catch((error: unknown) => {
      this.logger.warn(`No se pudo marcar el uso del cliente ${clientId}: ${String(error)}`);
    });
  }

  /** Emite (y persiste hasheados) un access token + refresh token encadenados. */
  private async issueTokens(
    userId: string,
    clientId: string,
    scopes: string[],
    audience: string,
    parentHash?: string,
  ): Promise<OAuthTokens> {
    const accessToken = this.randomToken();
    const refreshToken = this.randomToken();
    const now = Date.now();

    await this.db.insert(oauthTokens).values([
      {
        tokenHash: this.hash(accessToken),
        type: 'access',
        userId,
        clientId,
        scopes,
        audience,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
      {
        tokenHash: this.hash(refreshToken),
        type: 'refresh',
        userId,
        clientId,
        scopes,
        audience,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
        parentHash: parentHash ?? null,
      },
    ]);

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: scopes.join(' '),
      refresh_token: refreshToken,
    };
  }

  /**
   * Valida el `resource` (RFC 8707) y devuelve SIEMPRE la audiencia canónica. Si se indica
   * un recurso distinto del nuestro, lo rechaza (no emitimos tokens para otros servidores).
   */
  private validateResource(resource?: URL): string {
    if (resource && resource.href.replace(/\/$/, '') !== this.urls.audience) {
      throw new InvalidTargetError(`Unknown resource: ${resource.href}`);
    }
    return this.urls.audience;
  }

  /** Normaliza/valida los scopes pedidos; por defecto, solo lectura. */
  private effectiveScopes(scopes?: string[]): string[] {
    const requested = scopes && scopes.length > 0 ? scopes : [SCOPE_PORTFOLIO_READ];
    const supported = new Set(SCOPES_SUPPORTED);
    const unknown = requested.filter((scope) => !supported.has(scope));
    if (unknown.length > 0) {
      throw new InvalidScopeError(`Unsupported scope(s): ${unknown.join(', ')}`);
    }
    return Array.from(new Set(requested));
  }

  /** Lee la sesión del magic link (cookie JWT) y devuelve el `userId`, o null. */
  private async readSession(req: Request): Promise<string | null> {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      return null;
    }
    try {
      const payload = await this.jwt.verifyAsync<SessionJwt>(token);
      return payload.sub;
    } catch {
      return null;
    }
  }

  /** URL pública completa de la petición actual (sobre el issuer canónico). */
  private currentUrl(req: Request): URL {
    return new URL(req.originalUrl, this.urls.issuer);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private randomToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
