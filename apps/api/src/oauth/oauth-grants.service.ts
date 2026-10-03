import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';

/** A consent with its client's readable data. */
export interface GrantWithClient {
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * OAuth consents (`oauth_grants` table): which scopes a user has granted to a client. It is the
 * legal basis (GDPR) for the access and what the "Connected apps" screen lists and revokes. Shared
 * between the provider (`authorize`) and the consent flow.
 */
@Injectable()
export class OAuthGrantsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Has the user already granted this client every requested scope? */
  async hasConsent(userId: string, clientId: string, scopes: string[]): Promise<boolean> {
    const [row] = await this.db
      .select({ scopes: oauthGrants.scopes })
      .from(oauthGrants)
      .where(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)))
      .limit(1);
    if (!row) {
      return false;
    }
    const granted = new Set(row.scopes);
    return scopes.every((scope) => granted.has(scope));
  }

  /**
   * Records/updates the consent. It takes the UNION with what was already granted (step-up:
   * requesting a new scope must not lose the earlier ones), keeping the grant order. Sets
   * `lastUsedAt`. It is a single statement (`INSERT … ON CONFLICT`): with read-then-write, two
   * concurrent approvals clashed on the unique index or overwrote each other's union.
   */
  async recordConsent(userId: string, clientId: string, scopes: string[]): Promise<void> {
    const now = new Date();
    await this.db
      .insert(oauthGrants)
      .values({ userId, clientId, scopes: Array.from(new Set(scopes)), lastUsedAt: now })
      .onConflictDoUpdate({
        target: [oauthGrants.userId, oauthGrants.clientId],
        set: {
          scopes: sql`(
            select jsonb_agg(scope order by position)
            from (
              select scope, min(position) as position
              from jsonb_array_elements_text(${oauthGrants.scopes} || excluded.scopes) with ordinality as t(scope, position)
              group by scope
            ) as granted
          )`,
          lastUsedAt: now,
        },
      });
  }

  /** Marks the consent as used (when a token is issued). Best-effort. */
  async touch(userId: string, clientId: string): Promise<void> {
    await this.db
      .update(oauthGrants)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)));
  }

  /**
   * Revokes a client's access for a user: deletes the consent and all its tokens (access and
   * refresh). Used by "Connected apps" (Phase D) and on refresh-token reuse. Scoping by `userId`
   * prevents revoking someone else's.
   */
  async revoke(userId: string, clientId: string): Promise<void> {
    // In a transaction: if the second delete failed, a consent would be left without tokens (or the
    // other way round), and the connected apps screen would lie.
    await this.db.transaction(async (inner) => {
      await inner.delete(oauthTokens).where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId)));
      await inner.delete(oauthGrants).where(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)));
    });
  }

  /**
   * The user's consents with their client's name and URL ("Connected apps" and the GDPR export),
   * most recently used first. A single query: the client is joined here instead of fetched grant by
   * grant. A grant whose client no longer exists comes out without a name.
   */
  async listWithClients(userId: string): Promise<GrantWithClient[]> {
    return this.db
      .select({
        clientId: oauthGrants.clientId,
        clientName: sql<string | null>`${oauthClients.data}->>'client_name'`,
        clientUri: sql<string | null>`${oauthClients.data}->>'client_uri'`,
        scopes: oauthGrants.scopes,
        createdAt: oauthGrants.createdAt,
        lastUsedAt: oauthGrants.lastUsedAt,
      })
      .from(oauthGrants)
      .leftJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId))
      .where(eq(oauthGrants.userId, userId))
      .orderBy(sql`${oauthGrants.lastUsedAt} desc nulls last`);
  }
}
