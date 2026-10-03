import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { Position } from '../db/schema.js';
import { DividendResolutionService } from '../income/dividend-resolution.service.js';
import { POSITION_CREATED_EVENT, type PositionCreatedEvent } from '../positions/position-events.js';
import { PriceHistoryService } from '../prices/price-history.service.js';

/**
 * Trabajo posterior a una importación que no hace esperar la respuesta: precios e histórico de
 * las posiciones nuevas y resolución de dividendos con datos de mercado. Un fallo aquí no afecta a
 * la importación ya confirmada; el refresco diario repara lo que falte.
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
   * Lanza en segundo plano lo que toca tras confirmar: con posiciones nuevas, sus precios (los
   * derivados no se valoran) y después los dividendos; sin ellas, solo los dividendos.
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

  /** Secuencial, una llamada por ISIN, para no ráfagear Yahoo. */
  private async primeThenResolve(userId: string, created: readonly Position[]): Promise<void> {
    try {
      for (const position of created) {
        await this.prices.primeSymbol(position.ticker, position.currency);
      }
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
      await this.resolveDividends(userId);
    } catch (error) {
      this.logger.warn(
        `Refresco de precios tras importar falló: ${error instanceof Error ? error.name : 'error desconocido'}`,
      );
    }
  }

  /** Completa los dividendos con los datos de mercado ya cacheados. */
  private async resolveDividends(userId: string): Promise<void> {
    try {
      await this.dividends.resolvePending(userId);
    } catch (error) {
      this.logger.warn(
        `Resolución de dividendos tras importar falló: ${error instanceof Error ? error.name : 'error desconocido'}`,
      );
    }
  }
}
