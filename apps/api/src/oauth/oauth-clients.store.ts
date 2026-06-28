import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

import { DRIZZLE, type Database } from '../db/database.module';
import { oauthClients } from '../db/schema';

/**
 * Almacén de clientes OAuth respaldado por Postgres (vía Drizzle), tal y como lo espera el
 * SDK MCP. Soporta Dynamic Client Registration (RFC 7591): cuando el usuario conecta su
 * cliente LLM, el SDK genera `client_id`/`client_secret` y llama a `registerClient`, que
 * persiste el cliente completo. `getClient` lo recupera para autorizar y emitir tokens.
 */
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

  async registerClient(
    client: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    await this.db
      .insert(oauthClients)
      .values({ clientId: client.client_id, data: client })
      .onConflictDoUpdate({ target: oauthClients.clientId, set: { data: client } });
    return client;
  }
}
