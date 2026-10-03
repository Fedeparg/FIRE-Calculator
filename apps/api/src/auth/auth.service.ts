import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';

import { firstItem } from '@sextante/core/arrays';
import type { SessionUser } from '@sextante/core/contracts';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { loginTokens, users, type User } from '../db/schema.js';
import { EMAIL_SERVICE, type EmailService } from '../email/email.service.js';
import type { EmailLocale } from '../email/templates/fire-milestone.js';
import { randomToken, sha256Hex } from '../common/crypto.js';
import { LOGIN_LINK_TTL_MINUTES } from './session.constants.js';

/** Magic link lifetime. */
const TOKEN_TTL_MS = LOGIN_LINK_TTL_MINUTES * 60 * 1000;

/**
 * Per-email link limit: at most 3 every 15 minutes. The controller already limits per IP, but
 * with many IPs an address could still be bombed (burning the domain's reputation on Resend).
 * Above the limit the response is the same (202) and nothing is sent, so nothing is revealed.
 */
export const MAX_LINKS_PER_EMAIL = 3;
export const LINKS_PER_EMAIL_WINDOW_MS = 15 * 60 * 1000;

/** Controllers import it from here; the definition (contract with the frontend) lives in core. */
export type { SessionUser };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Generates a magic link and sends it. Does not reveal whether the email already exists
   * (passwordless: the user is created or signed in on verification). Idempotent from the
   * client's point of view. `locale` sets the language of the email and of the page the link
   * opens (`/en/...` for English).
   */
  async requestLink(rawEmail: string, locale: EmailLocale = 'es'): Promise<void> {
    const email = this.normalizeEmail(rawEmail);

    // Plain token for the link; only its hash is stored in the DB.
    const token = randomToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Count and then insert, serialised per email with a transaction-scoped lock: otherwise several
    // concurrent requests would see the same count and all get past the limit.
    const allowed = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('login_links'), hashtext(${email}))`);
      const recent = firstItem(
        await tx
          .select({ total: count() })
          .from(loginTokens)
          .where(
            and(
              eq(loginTokens.email, email),
              gt(loginTokens.createdAt, new Date(Date.now() - LINKS_PER_EMAIL_WINDOW_MS)),
            ),
          ),
      );
      if (recent.total >= MAX_LINKS_PER_EMAIL) return false;
      await tx.insert(loginTokens).values({ email, tokenHash, expiresAt });
      return true;
    });
    if (!allowed) {
      // The email stays out of the log (personal data): knowing that the limit kicked in is enough.
      this.logger.warn(`Per-email link limit reached (${MAX_LINKS_PER_EMAIL} in 15 min): not sending another`);
      return;
    }

    const appUrl = this.config.getOrThrow('APP_URL', { infer: true });
    // Spanish has no prefix (next-intl `as-needed`); English uses `/en`.
    const localePrefix = locale === 'es' ? '' : `/${locale}`;
    const link = `${appUrl}${localePrefix}/auth/verify?token=${token}`;
    await this.email.sendMagicLink(email, link, locale);
  }

  /**
   * Redeems the link token for a user. The token is single-use: the
   * `UPDATE ... WHERE consumedAt IS NULL ... RETURNING` consumes it atomically, so
   * two concurrent requests cannot use the same token twice.
   */
  async verify(token: string): Promise<SessionUser> {
    const tokenHash = this.hashToken(token);

    const consumed = await this.db
      .update(loginTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(loginTokens.tokenHash, tokenHash),
          isNull(loginTokens.consumedAt),
          gt(loginTokens.expiresAt, new Date()),
        ),
      )
      .returning({ email: loginTokens.email });

    const row = consumed[0];
    if (!row) {
      throw new UnauthorizedException('Enlace no válido o caducado');
    }

    const user = await this.upsertUser(row.email);
    return { id: user.id, email: user.email };
  }

  /**
   * Deletes the user's account (GDPR right to erasure). Removes the `users` row; everything else
   * (`positions`, `position_lots`, `portfolio_snapshots`, `saved_scenarios`,
   * `user_notification_settings`, OAuth tokens and grants) goes via `ON DELETE CASCADE`. The
   * `userId` comes from the JWT.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
  }

  private async upsertUser(email: string): Promise<User> {
    await this.db.insert(users).values({ email }).onConflictDoNothing();
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user) {
      // Should never happen (we have just ensured it exists).
      this.logger.error(`User not found after upsert: ${email}`);
      throw new UnauthorizedException();
    }
    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return sha256Hex(token);
  }
}
