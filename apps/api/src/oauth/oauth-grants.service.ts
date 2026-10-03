import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';

/** Un consentimiento con los datos legibles de su cliente. */
export interface GrantWithClient {
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Consentimientos OAuth (tabla `oauth_grants`): qué scopes ha concedido un usuario a un
 * cliente. Es la base jurídica (RGPD) del acceso y lo que la pantalla "Aplicaciones
 * conectadas" lista y revoca. Compartido entre el provider (`authorize`) y el flujo de
 * consentimiento.
 */
@Injectable()
export class OAuthGrantsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** ¿El usuario ya consintió a este cliente todos los scopes pedidos? */
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
   * Registra/actualiza el consentimiento. Hace UNIÓN con lo ya concedido (step-up: pedir
   * un scope nuevo no debe perder los anteriores), conservando el orden de concesión. Marca
   * `lastUsedAt`. Es una sola sentencia (`INSERT … ON CONFLICT`): con leer y luego escribir, dos
   * aprobaciones simultáneas chocaban en el índice único o se pisaban la unión.
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

  /** Marca el consentimiento como usado (al emitir un token). Best-effort. */
  async touch(userId: string, clientId: string): Promise<void> {
    await this.db
      .update(oauthGrants)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)));
  }

  /**
   * Revoca el acceso de un cliente para un usuario: borra el consentimiento y todos sus
   * tokens (access y refresh). Usado por "Aplicaciones conectadas" (Fase D) y por reuso de
   * refresh. El scoping por `userId` impide revocar lo de otro.
   */
  async revoke(userId: string, clientId: string): Promise<void> {
    // En una transacción: si fallara el segundo borrado quedaría un consentimiento sin tokens (o
    // al revés), y la pantalla de aplicaciones conectadas mentiría.
    await this.db.transaction(async (inner) => {
      await inner.delete(oauthTokens).where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId)));
      await inner.delete(oauthGrants).where(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)));
    });
  }

  /**
   * Consentimientos del usuario con el nombre y la URL de su cliente ("Aplicaciones conectadas" y
   * exportación RGPD), los usados más recientemente primero. Una sola consulta: el cliente se une
   * aquí en vez de pedirlo grant a grant. Un grant cuyo cliente ya no existe sale sin nombre.
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
