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
 * Importación desde Trade Republic, sin estado: vista previa y confirmación reciben el mismo
 * CSV y lo reparsean, así que no se guarda nada entre ellas y el export solo vive lo que dura
 * la petición. Este servicio solo orquesta: el planificador lee y simula, el escritor escribe y
 * las tareas posteriores (precios, dividendos) corren en segundo plano.
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

  /** Calcula qué haría la confirmación, sin escribir nada. */
  async preview(userId: string, csv: string): Promise<ImportPlan> {
    return this.planner.plan(userId, parseOrThrow(csv));
  }

  /**
   * Escribe la importación en una transacción por posición: si una queda en negativo solo esa
   * se revierte y se informa. Idempotente por `external_id`.
   */
  async confirm(userId: string, csv: string): Promise<ImportResult> {
    const parsed = parseOrThrow(csv);
    // Un alta o un borrado concurrente entre esta lectura y la transacción acaban en el conflicto
    // de la restricción única o de la FK (`ErrorTranslationFilter`).
    const { groups, existing } = await this.planner.loadInstruments(userId, parsed.trades);

    const results: ImportResultPosition[] = [];
    const created: Position[] = [];
    const extended: Position[] = [];

    for (const group of groups) {
      const position = existing.get(group.isin);
      if (group.fresh.length === 0) {
        // Reimportar el mismo fichero también completa la clase de activo que falte.
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
          // No se vuelca el mensaje de la BD (puede incluir valores de la fila): solo el tipo.
          this.logger.error(
            `Importación de una posición fallida: ${error instanceof Error ? error.name : 'error desconocido'}`,
          );
        }
        results.push(resultOf(group, 'failed', 0, null, failure));
      }
    }

    this.tasks.schedule(userId, created);

    // Después de las posiciones: un dividendo se enlaza con la posición de su ISIN, aunque sea nueva.
    const income = await this.writer.importIncome(userId, parsed.income);

    // Importar sobre posiciones que ya existían puede traer operaciones antiguas: se rehace el
    // histórico al momento (las nuevas ya lo hacen con `POSITION_CREATED_EVENT`).
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
