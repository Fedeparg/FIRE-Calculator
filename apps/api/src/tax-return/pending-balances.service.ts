import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import type { PendingNegative } from '@sextante/core/fiscal/savings-base';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { savingsPendingBalances } from '../db/schema.js';
import type { ReplacePendingBalancesDto } from './dto/pending-balances.dto.js';

/** Pending negative balances entered by the user, from tax years Sextante does not compute. */
@Injectable()
export class PendingBalancesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(userId: string): Promise<PendingNegative[]> {
    const rows = await this.db
      .select()
      .from(savingsPendingBalances)
      .where(eq(savingsPendingBalances.userId, userId))
      .orderBy(asc(savingsPendingBalances.originYear), asc(savingsPendingBalances.kind));
    return rows.map((row) => ({ originYear: row.originYear, kind: row.kind, amount: Number(row.amount) }));
  }

  /** Replaces the whole list in one transaction: the form always sends everything. */
  async replace(userId: string, dto: ReplacePendingBalancesDto): Promise<PendingNegative[]> {
    await this.db.transaction(async (tx) => {
      await tx.delete(savingsPendingBalances).where(eq(savingsPendingBalances.userId, userId));
      if (dto.balances.length === 0) return;
      await tx
        .insert(savingsPendingBalances)
        .values(
          dto.balances.map((b) => ({ userId, originYear: b.originYear, kind: b.kind, amount: b.amount.toFixed(2) })),
        );
    });
    return this.list(userId);
  }
}
