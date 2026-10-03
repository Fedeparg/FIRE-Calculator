import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import { firstItem } from '@sextante/core/arrays';
import type { IncomeEvent } from '@sextante/core/fiscal/income';
import type { ImportedIncome } from '@sextante/core/imports/types';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { incomeEvents, type IncomeEventRow } from '../db/schema.js';
import { findOwnedPosition, type DatabaseOrTransaction } from '../positions/position-access.js';
import { withholdingsWithinGross, type CreateIncomeDto } from './dto/create-income.dto.js';
import type { IncomeQueryDto } from './dto/income-query.dto.js';
import type { UpdateIncomeDto } from './dto/update-income.dto.js';
import { toIncomeEvent } from './income.mapper.js';

/** Cobro importado listo para guardar: el del parser con su `external_id` ya prefijado y su posición. */
export type ImportedIncomeInput = ImportedIncome & { positionId: string | null };

/** Tope de ids por `IN (...)` al buscar duplicados. */
const ID_BATCH_SIZE = 500;

/** `numeric` acepta texto: se guarda el número tal cual, ya validado (6 decimales como mucho). */
const decimal = (value: number) => String(value);

/**
 * Cobros del usuario (dividendos, intereses, recompensas). Aislamiento como en las posiciones:
 * todo filtra por `userId` y un cobro o una posición ajenos dan 404.
 */
@Injectable()
export class IncomeService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(userId: string, query: IncomeQueryDto = {}): Promise<IncomeEvent[]> {
    const conditions = [eq(incomeEvents.userId, userId)];
    if (query.year !== undefined) {
      conditions.push(gte(incomeEvents.paidAt, `${query.year}-01-01`), lte(incomeEvents.paidAt, `${query.year}-12-31`));
    }
    if (query.positionId !== undefined) conditions.push(eq(incomeEvents.positionId, query.positionId));
    const rows = await this.db
      .select()
      .from(incomeEvents)
      .where(and(...conditions))
      .orderBy(asc(incomeEvents.paidAt), asc(incomeEvents.createdAt), asc(incomeEvents.id));
    return rows.map(toIncomeEvent);
  }

  async create(userId: string, dto: CreateIncomeDto): Promise<IncomeEvent> {
    // También aquí: la tool MCP valida con `.shape`, que no lleva la regla que cruza campos.
    if (!withholdingsWithinGross(dto)) {
      throw new BadRequestException(['gross: las retenciones no pueden superar el íntegro']);
    }
    if (dto.positionId) await findOwnedPosition(this.db, userId, dto.positionId);
    const row = firstItem(
      await this.db
        .insert(incomeEvents)
        .values({
          userId,
          positionId: dto.positionId ?? null,
          kind: dto.kind,
          paidAt: dto.paidAt,
          isin: dto.isin ?? null,
          name: dto.name ?? null,
          country: dto.country ?? null,
          currency: dto.currency ?? 'EUR',
          gross: decimal(dto.gross),
          withholdingOrigin: dto.withholdingOrigin == null ? null : decimal(dto.withholdingOrigin),
          withholdingSpain: decimal(dto.withholdingSpain ?? 0),
          reportedToAeat: dto.reportedToAeat ?? false,
          source: 'manual',
          grossSource: 'manual',
          withholdingOriginSource: dto.withholdingOrigin == null ? null : 'manual',
        })
        .returning(),
    );
    return toIncomeEvent(row);
  }

  async update(userId: string, id: string, dto: UpdateIncomeDto): Promise<IncomeEvent> {
    const current = await this.findOwned(this.db, userId, id);
    if (dto.positionId) await findOwnedPosition(this.db, userId, dto.positionId);

    // La regla que cruza campos se comprueba con el resultado final, no solo con lo enviado.
    const merged = {
      gross: dto.gross ?? Number(current.gross),
      withholdingOrigin:
        dto.withholdingOrigin !== undefined
          ? dto.withholdingOrigin
          : current.withholdingOrigin === null
            ? null
            : Number(current.withholdingOrigin),
      withholdingSpain: dto.withholdingSpain ?? Number(current.withholdingSpain),
    };
    if (!withholdingsWithinGross(merged)) {
      throw new BadRequestException(['gross: las retenciones no pueden superar el íntegro']);
    }

    const [row] = await this.db
      .update(incomeEvents)
      .set({
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.paidAt !== undefined && { paidAt: dto.paidAt }),
        ...(dto.positionId !== undefined && { positionId: dto.positionId }),
        ...(dto.isin !== undefined && { isin: dto.isin }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        // Lo que toca el usuario pasa a ser suyo: deja de ser del bróker, deducido o estimado.
        ...(dto.gross !== undefined && { gross: decimal(dto.gross), grossSource: 'manual' as const }),
        ...(dto.withholdingOrigin !== undefined && {
          withholdingOrigin: dto.withholdingOrigin === null ? null : decimal(dto.withholdingOrigin),
          withholdingOriginSource: dto.withholdingOrigin === null ? null : ('manual' as const),
        }),
        ...(dto.withholdingSpain !== undefined && { withholdingSpain: decimal(dto.withholdingSpain) }),
        ...(dto.reportedToAeat !== undefined && { reportedToAeat: dto.reportedToAeat }),
      })
      .where(and(eq(incomeEvents.id, id), eq(incomeEvents.userId, userId)))
      .returning();
    // Solo falta si se borró entre `findOwned` y el UPDATE.
    if (!row) throw new NotFoundException('Cobro no encontrado');
    return toIncomeEvent(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(this.db, userId, id);
    await this.db.delete(incomeEvents).where(and(eq(incomeEvents.id, id), eq(incomeEvents.userId, userId)));
  }

  /** `external_id` de los cobros dados que el usuario ya tiene importados. */
  async findImportedIds(userId: string, externalIds: readonly string[]): Promise<Set<string>> {
    const known = new Set<string>();
    for (let i = 0; i < externalIds.length; i += ID_BATCH_SIZE) {
      const rows = await this.db
        .select({ externalId: incomeEvents.externalId })
        .from(incomeEvents)
        .where(
          and(
            eq(incomeEvents.userId, userId),
            inArray(incomeEvents.externalId, externalIds.slice(i, i + ID_BATCH_SIZE)),
          ),
        );
      for (const row of rows) if (row.externalId) known.add(row.externalId);
    }
    return known;
  }

  /** Guarda cobros importados; idempotente por `external_id` (los ya importados se ignoran). Devuelve cuántos entraron. */
  async appendImported(
    db: DatabaseOrTransaction,
    userId: string,
    items: readonly ImportedIncomeInput[],
  ): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < items.length; i += ID_BATCH_SIZE) {
      const rows = await db
        .insert(incomeEvents)
        .values(
          items.slice(i, i + ID_BATCH_SIZE).map((item) => ({
            userId,
            positionId: item.positionId,
            kind: item.kind,
            paidAt: item.paidAt,
            isin: item.isin,
            name: item.name?.slice(0, 100) ?? null,
            country: item.country,
            currency: item.currency,
            gross: item.gross,
            withholdingOrigin: item.withholdingOrigin,
            withholdingSpain: item.withholdingSpain,
            reportedToAeat: item.reportedToAeat,
            source: 'trade_republic' as const,
            externalId: item.externalId,
            grossSource: item.grossSource,
            withholdingOriginSource: item.withholdingOriginSource,
            quantity: item.quantity,
            originalAmount: item.originalAmount,
            originalCurrency: item.originalCurrency,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: incomeEvents.id });
      inserted += rows.length;
    }
    return inserted;
  }

  private async findOwned(db: DatabaseOrTransaction, userId: string, id: string): Promise<IncomeEventRow> {
    const [row] = await db
      .select()
      .from(incomeEvents)
      .where(and(eq(incomeEvents.id, id), eq(incomeEvents.userId, userId)));
    if (!row) throw new NotFoundException('Cobro no encontrado');
    return row;
  }
}
