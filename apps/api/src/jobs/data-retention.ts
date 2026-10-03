import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { and, eq, inArray, isNull, lt, notExists, or, sql } from 'drizzle-orm';

import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { loginTokens, mcpAuditLog, oauthAuthCodes, oauthClients, oauthGrants, oauthTokens } from '../db/schema.js';
import { MS_PER_DAY } from '../common/dates.js';
import { scheduleFromEnv, TIME_ZONE } from '../common/schedule.js';
import { errorMessage } from '../common/errors.js';

/** Default: every hour at minute 15. 6-field format (s m h D M W). */
const DEFAULT_CRON = '0 15 * * * *';

/**
 * Rows per `DELETE`. Deleting in batches bounds the duration of each statement (and of its locks)
 * and the WAL of a single transaction when a lot has piled up, e.g. after raising a retention.
 */
export const RETENTION_BATCH_SIZE = 10_000;

/**
 * Retention periods (defaults in `config/env.ts`), in days. Rationale:
 *  - `login_tokens`: a magic link lives 15 min; a 30-day tail is ample margin to investigate a
 *    recent access incident without keeping an indefinite history.
 *  - `mcp_audit_log`: 180 days, to be able to reconstruct what an LLM client did over a
 *    reasonable period (GDPR: metadata only, but we don't keep it forever either).
 *  - `oauth_clients`: 30 days unused and with no consent or live token = abandoned DCR
 *    registration (a client that registered and never completed the flow).
 */
type RetentionKey = 'LOGIN_TOKEN_RETENTION_DAYS' | 'MCP_AUDIT_RETENTION_DAYS' | 'OAUTH_CLIENT_RETENTION_DAYS';

/** Rows deleted in one pass, per table. */
export interface ReapSummary {
  authCodes: number;
  tokens: number;
  loginTokens: number;
  auditEntries: number;
  clients: number;
}

/**
 * Periodic pruning of the tables that grow without bound. Database hygiene and data minimization
 * (GDPR): nothing that is no longer needed should stay stored. It lives in `jobs/` and not in
 * `oauth/` because it also prunes tables that are not OAuth's (`login_tokens`,
 * `mcp_audit_log`).
 *
 * What it deletes and why:
 *  1. Expired OAuth authorization codes and tokens (`expiresAt < now`). Only expired ones are
 *     deleted, not consumed-but-valid ones: a refresh token that was already rotated but is still
 *     valid must be kept to detect its reuse. An expired token is useless.
 *  2. `login_tokens` that are expired or already consumed and older than N days: magic links live
 *     15 minutes, so past the retention they are pure history.
 *  3. `mcp_audit_log` entries older than the configured retention.
 *  4. Old and ABANDONED `oauth_clients` registered through DCR.
 *
 * Configurable with `OAUTH_REAPER_CRON` (the variable name is kept to avoid touching the
 * production environment) and with the `*_RETENTION_DAYS` variables (see `.env.example`).
 */
@Injectable()
export class DataRetentionJob implements OnModuleInit {
  private readonly logger = new Logger(DataRetentionJob.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const cronTime = scheduleFromEnv(this.registry, {
      name: 'data-retention',
      cronTime: this.config.get('OAUTH_REAPER_CRON', { infer: true }),
      defaultCron: DEFAULT_CRON,
      handler: () => void this.runSafely(),
    });
    this.logger.log(`Cleanup scheduled: "${cronTime}" (${TIME_ZONE})`);
  }

  /** Cron wrapper: a failed cleanup must not bring the process down. */
  private async runSafely(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Cleanup failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Runs one cleanup pass and returns how many rows it deleted from each table (public so it can
   * be tested without starting the cron). It propagates errors: the caller decides what to do with
   * them.
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

    // Only log when something was deleted: on an idle system the hourly pass must not generate
    // noise.
    if (Object.values(summary).some((count) => count > 0)) {
      this.logger.log(
        `Cleanup: ${summary.authCodes} codes, ${summary.tokens} OAuth tokens, ` +
          `${summary.loginTokens} login tokens, ${summary.auditEntries} MCP audit ` +
          `entries and ${summary.clients} abandoned clients`,
      );
    }
    return summary;
  }

  private reapExpiredAuthCodes(now: Date): Promise<number> {
    const where = lt(oauthAuthCodes.expiresAt, now);
    return this.deleteInBatches(() =>
      this.db
        .delete(oauthAuthCodes)
        .where(
          inArray(
            oauthAuthCodes.codeHash,
            this.db
              .select({ key: oauthAuthCodes.codeHash })
              .from(oauthAuthCodes)
              .where(where)
              .limit(RETENTION_BATCH_SIZE),
          ),
        ),
    );
  }

  private reapExpiredTokens(now: Date): Promise<number> {
    const where = lt(oauthTokens.expiresAt, now);
    return this.deleteInBatches(() =>
      this.db
        .delete(oauthTokens)
        .where(
          inArray(
            oauthTokens.tokenHash,
            this.db.select({ key: oauthTokens.tokenHash }).from(oauthTokens).where(where).limit(RETENTION_BATCH_SIZE),
          ),
        ),
    );
  }

  /**
   * Magic-link tokens that are already useless (consumed or expired) and older than the retention.
   * The age condition is on `createdAt`, not on `expiresAt`: that is the date that really sets how
   * long we have been storing the data.
   */
  private reapLoginTokens(now: Date): Promise<number> {
    const cutoff = this.cutoff(now, 'LOGIN_TOKEN_RETENTION_DAYS');
    const where = and(
      lt(loginTokens.createdAt, cutoff),
      or(lt(loginTokens.expiresAt, now), sql`${loginTokens.consumedAt} is not null`),
    );
    return this.deleteInBatches(() =>
      this.db
        .delete(loginTokens)
        .where(
          inArray(
            loginTokens.id,
            this.db.select({ key: loginTokens.id }).from(loginTokens).where(where).limit(RETENTION_BATCH_SIZE),
          ),
        ),
    );
  }

  private reapAuditLog(now: Date): Promise<number> {
    const where = lt(mcpAuditLog.createdAt, this.cutoff(now, 'MCP_AUDIT_RETENTION_DAYS'));
    return this.deleteInBatches(() =>
      this.db
        .delete(mcpAuditLog)
        .where(
          inArray(
            mcpAuditLog.id,
            this.db.select({ key: mcpAuditLog.id }).from(mcpAuditLog).where(where).limit(RETENTION_BATCH_SIZE),
          ),
        ),
    );
  }

  /**
   * Abandoned DCR clients. Safety lies ENTIRELY in the predicate: `oauth_grants` and
   * `oauth_tokens` store the `clientId` as plain text, with no FK, so the database would not stop
   * us from deleting a client in use and leaving orphaned consents. That is why we explicitly
   * exclude every client with an associated consent or token.
   *
   * That exclusion is also what made the first run of this pruning safe: `lastUsedAt` was not
   * written until then, so every existing row had it NULL and only the "no grants or tokens"
   * criterion protected them. A client in real use always has a grant.
   */
  private reapAbandonedClients(now: Date): Promise<number> {
    const cutoff = this.cutoff(now, 'OAUTH_CLIENT_RETENTION_DAYS');
    const where = and(
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
    );
    return this.deleteInBatches(() =>
      this.db
        .delete(oauthClients)
        .where(
          inArray(
            oauthClients.clientId,
            this.db.select({ key: oauthClients.clientId }).from(oauthClients).where(where).limit(RETENTION_BATCH_SIZE),
          ),
        ),
    );
  }

  /**
   * Repeats a batch `DELETE` until it deletes fewer than `RETENTION_BATCH_SIZE` rows. It counts
   * with the `count` that postgres-js returns, without `RETURNING` (which would fetch the keys only
   * to count them).
   */
  private async deleteInBatches(deleteBatch: () => PromiseLike<{ count: number }>): Promise<number> {
    let total = 0;
    for (;;) {
      const { count } = await deleteBatch();
      total += count;
      if (count < RETENTION_BATCH_SIZE) return total;
    }
  }

  /** Cutoff date for a configurable retention (already validated, with its default, in `config/env.ts`). */
  private cutoff(now: Date, key: RetentionKey): Date {
    const days = this.config.get(key, { infer: true });
    return new Date(now.getTime() - days * MS_PER_DAY);
  }
}
