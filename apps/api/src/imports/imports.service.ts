import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ImportPlan, ImportResult, ImportResultPosition } from '@sextante/core/imports/types';

import type { Position } from '../db/schema.js';
import { LOT_CHANGED_EVENT, type LotChangedEvent } from '../positions/position-events.js';
import { parseOrThrow } from './parse-error.js';
import { PostImportTasks } from './post-import.tasks.js';
import { failureOf, TradeImportWriter } from './trade-import.writer.js';
import { resultOf, sum, TRADE_REPUBLIC_BROKER } from './trade-republic-import.model.js';
import { summarizeSkipped, TradeRepublicImportPlanner } from './trade-republic-import.planner.js';

/**
 * Stateless Trade Republic import: preview and confirm receive the same CSV and re-parse it, so
 * nothing is stored between them and the export only lives as long as the request. This service
 * only orchestrates: the planner reads and simulates, the writer writes and the follow-up tasks
 * (prices, dividends) run in the background.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly planner: TradeRepublicImportPlanner,
    private readonly writer: TradeImportWriter,
    private readonly tasks: PostImportTasks,
    private readonly events: EventEmitter2,
  ) {}

  /** Works out what the confirm would do, without writing anything. */
  async preview(userId: string, csv: string): Promise<ImportPlan> {
    return this.planner.plan(userId, parseOrThrow(csv));
  }

  /**
   * Writes the import in one transaction per position: if one ends up negative, only that one
   * is rolled back and reported. Idempotent by `external_id`.
   */
  async confirm(userId: string, csv: string): Promise<ImportResult> {
    const parsed = parseOrThrow(csv);
    // A concurrent create or delete between this read and the transaction ends in a unique
    // constraint or FK conflict (`ErrorTranslationFilter`).
    const { groups, existing } = await this.planner.loadInstruments(userId, parsed.trades);

    const results: ImportResultPosition[] = [];
    const created: Position[] = [];
    const extended: Position[] = [];

    for (const group of groups) {
      const position = existing.get(group.isin);
      if (group.fresh.length === 0) {
        // Re-importing the same file also fills in a missing asset class.
        await this.writer.backfillAssetClass(position, group);
        results.push(resultOf(group, 'unchanged', 0, null, null));
        continue;
      }
      try {
        const outcome = await this.writer.importInstrument(userId, group, position);
        if (outcome.wasCreated) created.push(outcome.position);
        else if (outcome.inserted > 0) extended.push(outcome.position);
        const status = outcome.inserted === 0 ? 'unchanged' : outcome.wasCreated ? 'created' : 'extended';
        results.push(resultOf(group, status, outcome.inserted, Number(outcome.position.quantity), null));
      } catch (error) {
        const failure = failureOf(error);
        if (failure === 'UNEXPECTED') {
          // The database message is not dumped (it may include row values): only the type.
          this.logger.error(`Position import failed: ${error instanceof Error ? error.name : 'unknown error'}`);
        }
        results.push(resultOf(group, 'failed', 0, null, failure));
      }
    }

    this.tasks.schedule(userId, created);

    // After the positions: a dividend is linked to the position of its ISIN, even a new one.
    const income = await this.writer.importIncome(userId, parsed.income);

    // Importing into existing positions may bring in old trades: the history is rebuilt right
    // away (new positions already do so via `POSITION_CREATED_EVENT`).
    for (const position of extended) {
      this.events.emit(LOT_CHANGED_EVENT, { userId, positionId: position.id } satisfies LotChangedEvent);
    }

    return {
      broker: TRADE_REPUBLIC_BROKER,
      positions: results,
      totals: {
        lotsCreated: sum(results.map((r) => r.lotsCreated)),
        duplicates: sum(results.map((r) => r.duplicates)),
        failedPositions: results.filter((r) => r.status === 'failed').length,
      },
      income,
      skipped: summarizeSkipped(parsed),
      warnings: parsed.warnings,
    };
  }
}
