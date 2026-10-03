import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { Position } from '../db/schema.js';
import { DividendResolutionService } from '../income/dividend-resolution.service.js';
import { POSITION_CREATED_EVENT, type PositionCreatedEvent } from '../positions/position-events.js';
import { PriceHistoryService } from '../prices/price-history.service.js';

/**
 * Post-import work that does not hold up the response: prices and history for the new positions
 * and dividend resolution with market data. A failure here does not affect the already confirmed
 * import; the daily refresh repairs whatever is missing.
 */
@Injectable()
export class PostImportTasks {
  private readonly logger = new Logger(PostImportTasks.name);

  constructor(
    private readonly prices: PriceHistoryService,
    private readonly events: EventEmitter2,
    private readonly dividends: DividendResolutionService,
  ) {}

  /**
   * Starts in the background whatever follows a confirm: with new positions, their prices
   * (derivatives are not valued) and then the dividends; without them, only the dividends.
   */
  schedule(userId: string, created: readonly Position[]): void {
    if (created.length > 0) {
      void this.primeThenResolve(
        userId,
        created.filter((position) => !position.isDerivative),
      );
    } else {
      void this.resolveDividends(userId);
    }
  }

  /** Sequential, one call per ISIN, so as not to burst Yahoo. */
  private async primeThenResolve(userId: string, created: readonly Position[]): Promise<void> {
    try {
      for (const position of created) {
        await this.prices.primeSymbol(position.ticker, position.currency);
      }
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
      await this.resolveDividends(userId);
    } catch (error) {
      this.logger.warn(`Post-import price refresh failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    }
  }

  /** Completes the dividends with the market data already cached. */
  private async resolveDividends(userId: string): Promise<void> {
    try {
      await this.dividends.resolvePending(userId);
    } catch (error) {
      this.logger.warn(
        `Post-import dividend resolution failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
  }
}
