import { Inject, Injectable, Logger } from '@nestjs/common';
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

import { DRIZZLE, type Database, type DatabaseOrTransaction } from '../db/database.module.js';
import { oauthAuthCodes, oauthTokens } from '../db/schema.js';
import { SessionService } from '../auth/session.service.js';
import { OAuthClientsStore } from './oauth-clients.store.js';
import { OAuthGrantsService } from './oauth-grants.service.js';
import { OAuthUrls } from './oauth-urls.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  SCOPE_PORTFOLIO_READ,
  SCOPES_SUPPORTED,
  withImpliedScopes,
} from './oauth.constants.js';
import { randomToken, sha256Hex } from '../common/crypto.js';

/**
 * Sextante's Authorization Server for MCP, implementing the official SDK's `OAuthServerProvider`
 * interface. The SDK mounts the HTTP endpoints (`/authorize`, `/token`, `/register`, `/revoke`,
 * discovery, PRM) and validates PKCE; WE implement the logic and ISSUE the tokens. See
 * `_local/mcp-integracion.md`.
 *
 * Security invariants we own (the SDK does not cover them):
 *  - Codes and tokens are only stored hashed (SHA-256), never in plain text.
 *  - Atomic single-use codes (`UPDATE … WHERE consumedAt IS NULL … RETURNING`).
 *  - Audience binding (RFC 8707): the token is issued and VERIFIED against the canonical URI
 *    `…/api/mcp`; a token for another resource is rejected.
 *  - `authorize()` requires a signed-in session (the magic-link cookie) and prior consent.
 *  - Refresh with rotation + reuse detection (revokes the chain).
 */
@Injectable()
export class SextanteOAuthProvider implements OAuthServerProvider {
  private readonly logger = new Logger(SextanteOAuthProvider.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly sessions: SessionService,
    private readonly urls: OAuthUrls,
    private readonly clients: OAuthClientsStore,
    private readonly grants: OAuthGrantsService,
  ) {}

  get clientsStore(): OAuthClientsStore {
    return this.clients;
  }

  /**
   * Start of the authorization flow (browser). Three paths:
   *  1. No session → redirects to the login, which returns to this same `/authorize` URL.
   *  2. Session but no consent → redirects to the consent screen, which returns to this same URL
   *     after approval.
   *  3. Session and consent → issues the code and redirects to the client.
   */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // RFC 8707: the token must be meant for OUR MCP server.
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
      // The original `/authorize` query, to resume the flow on OUR origin after approval (not an
      // open redirect: the host is pinned to our issuer).
      consentUrl.searchParams.set('authorize_params', here.search.replace(/^\?/, ''));
      res.redirect(consentUrl.href);
      return;
    }

    const code = this.newToken();
    await this.db.insert(oauthAuthCodes).values({
      codeHash: sha256Hex(code),
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

  /** Returns the code's `code_challenge` (the SDK uses it to validate PKCE). Does not consume it. */
  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const [row] = await this.db
      .select({ codeChallenge: oauthAuthCodes.codeChallenge })
      .from(oauthAuthCodes)
      .where(
        and(
          eq(oauthAuthCodes.codeHash, sha256Hex(authorizationCode)),
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

  /** Exchanges the code for tokens. The SDK has already validated PKCE; here we consume the code (atomically). */
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
          eq(oauthAuthCodes.codeHash, sha256Hex(authorizationCode)),
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
    // The token audience = the one requested in `/authorize` (canonical). If `/token` includes
    // `resource`, it must match.
    const audience = this.validateResource(resource);
    if (code.resource && code.resource !== audience) {
      throw new InvalidTargetError('resource does not match the authorization request');
    }

    const tokens = await this.issueTokens(code.userId, code.clientId, code.scopes, audience);
    await this.grants.touch(code.userId, code.clientId);
    this.touchClient(code.clientId);
    return tokens;
  }

  /** Exchanges a refresh token for a new one (rotation + reuse detection). */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const refreshHash = sha256Hex(refreshToken);
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
      // Reuse of an already rotated refresh token: possible theft → revoke the client's whole chain.
      this.logger.warn(`Refresh token reuse detected (user=${row.userId}, client=${row.clientId}); revoking`);
      await this.grants.revoke(row.userId, row.clientId);
      throw new InvalidGrantError('Refresh token reuse detected; access revoked');
    }
    if (row.expiresAt < new Date()) {
      throw new InvalidGrantError('Refresh token expired');
    }

    // Validate BEFORE consuming: a malformed request (extra scopes, another resource) must not
    // spend the refresh token, or the client would lose its chain over its own mistake.
    // A refresh can only narrow scopes, never widen them.
    let nextScopes = row.scopes;
    if (scopes && scopes.length > 0) {
      const granted = new Set(row.scopes);
      if (!scopes.every((scope) => granted.has(scope))) {
        throw new InvalidScopeError('Requested scopes exceed the original grant');
      }
      nextScopes = scopes;
    }
    const audience = this.validateResource(resource);

    // Consume and issue in the SAME transaction: if issuance failed after consuming, the client
    // would be left without a valid refresh token and its retry would look like reuse (revocation).
    const tokens = await this.db.transaction(async (tx) => {
      // Atomic consumption: if another request consumed it first, treat it as reuse.
      const [consumed] = await tx
        .update(oauthTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(oauthTokens.tokenHash, refreshHash), isNull(oauthTokens.consumedAt)))
        .returning({ tokenHash: oauthTokens.tokenHash });
      if (!consumed) return null;
      return this.issueTokens(row.userId, row.clientId, nextScopes, audience, refreshHash, tx);
    });
    if (!tokens) {
      await this.grants.revoke(row.userId, row.clientId);
      throw new InvalidGrantError('Refresh token reuse detected; access revoked');
    }

    this.touchClient(row.clientId);
    return tokens;
  }

  /**
   * Verifies an access token (called by `requireBearerAuth`). Resolves the Bearer → AuthInfo with
   * the `userId` in `extra` (what the tools use for scoping). Anti-leakage BARRIER #1: rejects it
   * if the audience is not our canonical URI (a token issued for another resource).
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const [row] = await this.db
      .select()
      .from(oauthTokens)
      .where(and(eq(oauthTokens.tokenHash, sha256Hex(token)), eq(oauthTokens.type, 'access')))
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
      // Tokens issued before `write` implied `read` are read with the current rule.
      scopes: withImpliedScopes(row.scopes),
      expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
      resource: new URL(row.audience),
      extra: { userId: row.userId },
    };
  }

  /** Revokes a specific token (access or refresh) of this client. Idempotent. */
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await this.db
      .delete(oauthTokens)
      .where(and(eq(oauthTokens.tokenHash, sha256Hex(request.token)), eq(oauthTokens.clientId, client.client_id)));
  }

  /* --------------------------------- helpers -------------------------------- */

  /**
   * Marks the client as used (the `lastUsedAt` column, which the `jobs/data-retention.ts` pruning
   * uses to avoid purging live clients). Deliberately not awaited: it is telemetry, not part of the
   * exchange contract, so it must not add latency to `/token` nor fail issuance if the UPDATE
   * fails. An error is only logged.
   */
  private touchClient(clientId: string): void {
    void this.clients.touch(clientId).catch((error: unknown) => {
      this.logger.warn(`Could not mark client ${clientId} as used: ${String(error)}`);
    });
  }

  /** Issues (and persists hashed) a chained access token + refresh token. */
  private async issueTokens(
    userId: string,
    clientId: string,
    scopes: string[],
    audience: string,
    parentHash?: string,
    db: DatabaseOrTransaction = this.db,
  ): Promise<OAuthTokens> {
    const accessToken = this.newToken();
    const refreshToken = this.newToken();
    const now = Date.now();

    await db.insert(oauthTokens).values([
      {
        tokenHash: sha256Hex(accessToken),
        type: 'access',
        userId,
        clientId,
        scopes,
        audience,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
      {
        tokenHash: sha256Hex(refreshToken),
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
   * Validates the `resource` (RFC 8707) and always returns the canonical audience. If a resource
   * other than ours is given, it is rejected (we do not issue tokens for other servers).
   */
  private validateResource(resource?: URL): string {
    if (resource && resource.href.replace(/\/$/, '') !== this.urls.audience) {
      throw new InvalidTargetError(`Unknown resource: ${resource.href}`);
    }
    return this.urls.audience;
  }

  /** Normalises/validates the requested scopes; read-only by default. `write` implies `read`. */
  private effectiveScopes(scopes?: string[]): string[] {
    const requested = scopes && scopes.length > 0 ? scopes : [SCOPE_PORTFOLIO_READ];
    const supported = new Set(SCOPES_SUPPORTED);
    const unknown = requested.filter((scope) => !supported.has(scope));
    if (unknown.length > 0) {
      throw new InvalidScopeError(`Unsupported scope(s): ${unknown.join(', ')}`);
    }
    return withImpliedScopes(requested);
  }

  /**
   * `userId` of the magic-link session, or null. Same rule as `JwtAuthGuard` (`SessionService`): a
   * deleted account cannot authorize clients with a JWT that has not expired yet.
   */
  private async readSession(req: Request): Promise<string | null> {
    return (await this.sessions.resolve(req))?.id ?? null;
  }

  /**
   * Random token for codes and tokens. It is a method (rather than a direct `randomToken` call) so
   * tests can force a collision and check that issuance is atomic.
   */
  private newToken(): string {
    return randomToken();
  }

  /** Full public URL of the current request (on the canonical issuer). */
  private currentUrl(req: Request): URL {
    return new URL(req.originalUrl, this.urls.issuer);
  }
}
