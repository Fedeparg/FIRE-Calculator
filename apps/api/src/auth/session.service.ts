import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, sql } from 'drizzle-orm';
import type { Request } from 'express';

import { SESSION_COOKIE, type SessionUser } from '@sextante/core/contracts';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';

/**
 * Session JWT payload. `ver` is the user's session version when it was signed: if the DB one has
 * gone up (logout, "close all sessions"), the JWT stops being valid even though its signature and
 * expiry are still fine. It is optional: JWTs issued before the column existed do not carry it
 * and count as version 0, the initial one, so deploying did not log everyone out.
 */
type SessionJwt = { sub: string; email: string; ver?: number };

/**
 * The single check of the magic-link session (JWT cookie). Used by `JwtAuthGuard` (API routes)
 * and by the OAuth provider (`/authorize`), so both apply the same rule: valid signature and
 * expiry, a user that STILL exists (a deleted account, or a DB reset in dev, leaves no ghost
 * sessions) and a current session version (a closed session cannot be reused even if someone
 * kept the JWT). It costs one SELECT per authenticated request, acceptable at this scale.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Signs a user's session JWT with their current session version. */
  async sign(user: SessionUser): Promise<string> {
    const [row] = await this.db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const payload: SessionJwt = { sub: user.id, email: user.email, ver: row?.sessionVersion ?? 0 };
    return this.jwt.signAsync(payload);
  }

  /** User from the request's session cookie, or `null` if there is no valid session. */
  async resolve(req: Request): Promise<SessionUser | null> {
    const cookies = (req.cookies ?? {}) as Partial<Record<string, string>>;
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;

    let payload: SessionJwt;
    try {
      payload = await this.jwt.verifyAsync<SessionJwt>(token);
    } catch {
      return null;
    }

    const [user] = await this.db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!user || (payload.ver ?? 0) !== user.sessionVersion) return null;
    return { id: payload.sub, email: payload.email };
  }

  /**
   * Invalidates ALL of the user's open sessions: bumps their session version, so JWTs already
   * issued (on this or any other device) stop being valid.
   */
  async revokeAll(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
