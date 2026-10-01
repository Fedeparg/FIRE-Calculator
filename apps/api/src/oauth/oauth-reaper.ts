import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { and, eq, isNull, lt, notExists, or, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { loginTokens, mcpAuditLog, oauthAuthCodes, oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';

/** Por defecto: cada hora en el minuto 15. Formato de 6 campos (s m h D M W). */
const DEFAULT_CRON = '0 15 * * * *';
const TIME_ZONE = 'Europe/Madrid';

/**
 * Retenciones por defecto, en días. Criterios:
 *  - `login_tokens`: un magic link vive 15 min; 30 días de cola es margen de sobra para
 *    poder investigar un incidente de acceso reciente sin guardar historial indefinido.
 *  - `mcp_audit_log`: 180 días, para poder reconstruir qué hizo un cliente LLM durante un
 *    periodo razonable (RGPD: solo metadatos, pero tampoco los guardamos para siempre).
 *  - `oauth_clients`: 30 días sin uso y sin consentimiento ni token vivo = registro DCR
 *    abandonado (un cliente que se registró y nunca completó el flujo).
 */
const DEFAULT_LOGIN_TOKEN_RETENTION_DAYS = 30;
const DEFAULT_MCP_AUDIT_RETENTION_DAYS = 180;
const DEFAULT_OAUTH_CLIENT_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Filas borradas en una pasada, por tabla. */
export interface ReapSummary {
  authCodes: number;
  tokens: number;
  loginTokens: number;
  auditEntries: number;
  clients: number;
}

/**
 * Poda periódica de las tablas que crecen sin límite. Higiene de la base de datos y
 * minimización de datos (RGPD): nada que ya no sirva debe seguir almacenado.
 *
 * Qué borra y por qué:
 *  1. Códigos de autorización y tokens OAuth caducados (`expiresAt < now`). Se borran solo
 *     los caducados, no los consumidos-pero-vigentes: un refresh ya rotado pero aún válido
 *     debe conservarse para detectar su reuso. Un token caducado ya no sirve para nada.
 *  2. `login_tokens` caducados o ya consumidos con más de N días: los magic link viven 15
 *     minutos, así que pasada la retención son puro histórico.
 *  3. `mcp_audit_log` más antiguo que la retención configurada.
 *  4. `oauth_clients` registrados por DCR, antiguos y ABANDONADOS.
 *
 * Análogo al `DailyJobsScheduler`. Configurable con `OAUTH_REAPER_CRON` y con las variables
 * `*_RETENTION_DAYS` (ver `.env.example`).
 */
@Injectable()
export class OAuthReaper implements OnModuleInit {
  private readonly logger = new Logger(OAuthReaper.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    // `|| DEFAULT_CRON` (no `??`): la env vacía del compose llega como "" y debe caer al default.
    const cronTime = this.config.get<string>('OAUTH_REAPER_CRON')?.trim() || DEFAULT_CRON;
    const job = new CronJob(cronTime, () => void this.runSafely(), null, false, TIME_ZONE);
    this.registry.addCronJob('oauth-reaper', job);
    job.start();
    this.logger.log(`Limpieza programada: "${cronTime}" (${TIME_ZONE})`);
  }

  /** Envoltorio del cron: un fallo de la limpieza no debe tumbar el proceso. */
  private async runSafely(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Limpieza falló: ${(error as Error).message}`);
    }
  }

  /**
   * Ejecuta una pasada de limpieza y devuelve cuántas filas ha borrado de cada tabla
   * (público para poder testearlo sin arrancar el cron). Propaga los errores: quien lo
   * llama decide qué hacer con ellos.
   */
  async run(): Promise<ReapSummary> {
    const now = new Date();
    const summary: ReapSummary = {
      authCodes: await this.reapExpiredAuthCodes(now),
      tokens: await this.reapExpiredTokens(now),
      loginTokens: await this.reapLoginTokens(now),
      auditEntries: await this.reapAuditLog(now),
      clients: await this.reapAbandonedClients(now),
    };

    // Solo se loguea si ha borrado algo: en un sistema en reposo la pasada horaria no
    // debe generar ruido.
    if (Object.values(summary).some((count) => count > 0)) {
      this.logger.log(
        `Limpieza: ${summary.authCodes} códigos, ${summary.tokens} tokens OAuth, ` +
          `${summary.loginTokens} tokens de login, ${summary.auditEntries} entradas de ` +
          `auditoría MCP y ${summary.clients} clientes abandonados`,
      );
    }
    return summary;
  }

  private async reapExpiredAuthCodes(now: Date): Promise<number> {
    const rows = await this.db
      .delete(oauthAuthCodes)
      .where(lt(oauthAuthCodes.expiresAt, now))
      .returning({ codeHash: oauthAuthCodes.codeHash });
    return rows.length;
  }

  private async reapExpiredTokens(now: Date): Promise<number> {
    const rows = await this.db
      .delete(oauthTokens)
      .where(lt(oauthTokens.expiresAt, now))
      .returning({ tokenHash: oauthTokens.tokenHash });
    return rows.length;
  }

  /**
   * Tokens de magic link ya inservibles (consumidos o caducados) y más viejos que la
   * retención. La condición de antigüedad va sobre `createdAt`, no sobre `expiresAt`: es la
   * fecha que fija de verdad cuánto tiempo llevamos guardando el dato.
   */
  private async reapLoginTokens(now: Date): Promise<number> {
    const cutoff = this.cutoff(now, 'LOGIN_TOKEN_RETENTION_DAYS', DEFAULT_LOGIN_TOKEN_RETENTION_DAYS);
    const rows = await this.db
      .delete(loginTokens)
      .where(
        and(
          lt(loginTokens.createdAt, cutoff),
          or(lt(loginTokens.expiresAt, now), sql`${loginTokens.consumedAt} is not null`),
        ),
      )
      .returning({ id: loginTokens.id });
    return rows.length;
  }

  private async reapAuditLog(now: Date): Promise<number> {
    const cutoff = this.cutoff(now, 'MCP_AUDIT_RETENTION_DAYS', DEFAULT_MCP_AUDIT_RETENTION_DAYS);
    const rows = await this.db
      .delete(mcpAuditLog)
      .where(lt(mcpAuditLog.createdAt, cutoff))
      .returning({ id: mcpAuditLog.id });
    return rows.length;
  }

  /**
   * Clientes DCR abandonados. La seguridad está ENTERAMENTE en el predicado: `oauth_grants`
   * y `oauth_tokens` guardan el `clientId` como texto suelto, sin FK, así que la base de
   * datos no impediría borrar un cliente en uso y dejar consentimientos huérfanos. Por eso
   * excluimos explícitamente todo cliente con un consentimiento o un token asociado.
   *
   * Esa exclusión es también lo que hace seguro el estreno de esta poda: `lastUsedAt` no se
   * escribía hasta ahora, así que todas las filas existentes lo tienen a NULL y solo el
   * criterio "sin grants ni tokens" las salva. Un cliente en uso real siempre tiene grant.
   */
  private async reapAbandonedClients(now: Date): Promise<number> {
    const cutoff = this.cutoff(now, 'OAUTH_CLIENT_RETENTION_DAYS', DEFAULT_OAUTH_CLIENT_RETENTION_DAYS);
    const rows = await this.db
      .delete(oauthClients)
      .where(
        and(
          lt(oauthClients.createdAt, cutoff),
          or(isNull(oauthClients.lastUsedAt), lt(oauthClients.lastUsedAt, cutoff)),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(oauthGrants)
              .where(eq(oauthGrants.clientId, oauthClients.clientId)),
          ),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(oauthTokens)
              .where(eq(oauthTokens.clientId, oauthClients.clientId)),
          ),
        ),
      )
      .returning({ clientId: oauthClients.clientId });
    return rows.length;
  }

  /**
   * Fecha de corte para una retención configurable. Un valor ausente, no numérico o ≤ 0 cae
   * al defecto: un typo en el entorno no debe convertirse en un borrado agresivo.
   */
  private cutoff(now: Date, envKey: string, defaultDays: number): Date {
    const parsed = Number.parseInt(this.config.get<string>(envKey)?.trim() ?? '', 10);
    const days = Number.isInteger(parsed) && parsed > 0 ? parsed : defaultDays;
    return new Date(now.getTime() - days * MS_PER_DAY);
  }
}
