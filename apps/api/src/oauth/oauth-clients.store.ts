import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { oauthClients } from '../db/schema.js';

/** Clientes OAuth en Postgres para el SDK MCP; soporta Dynamic Client Registration (RFC 7591) vía `registerClient`. */
@Injectable()
export class OAuthClientsStore implements OAuthRegisteredClientsStore {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const [row] = await this.db
      .select({ data: oauthClients.data })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    return row?.data;
  }

  async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    await this.db
      .insert(oauthClients)
      .values({ clientId: client.client_id, data: client })
      .onConflictDoUpdate({ target: oauthClients.clientId, set: { data: client } });
    return client;
  }

  /**
   * Marca el cliente como vivo. Se llama al canjear un token, no en `getClient` (que también
   * corre en un `/authorize` que acaba en login): así la poda de `jobs/data-retention.ts` distingue un registro DCR
   * abandonado de uno activo.
   */
  async touch(clientId: string): Promise<void> {
    await this.db.update(oauthClients).set({ lastUsedAt: new Date() }).where(eq(oauthClients.clientId, clientId));
  }
}
