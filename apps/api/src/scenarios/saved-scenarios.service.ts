import { MAX_SCENARIOS_PER_USER, type SavedScenarioResponse } from '@sextante/core/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';

import { DRIZZLE, type Database, type DatabaseOrTransaction } from '../db/database.module.js';
import { savedScenarios, type SavedScenario } from '../db/schema.js';
import type { CreateSavedScenarioDto } from './dto/create-saved-scenario.dto.js';
import type { UpdateSavedScenarioDto } from './dto/update-saved-scenario.dto.js';

/**
 * Tope de tamaño de `inputs`, medido en bytes UTF-8 del JSON serializado. 8 KiB sobran para
 * el formulario más largo de las calculadoras (decenas de campos numéricos) y cierran la
 * puerta a usar la cuenta como almacén de ficheros.
 */
export const MAX_INPUTS_BYTES = 8 * 1024;

/**
 * Escenarios guardados de calculadora. Mismo patrón de aislamiento que `positions`: el
 * `userId` viene siempre del JWT y toda consulta filtra por él; por id, 404 tanto si no existe como
 * si es de otro usuario.
 */
@Injectable()
export class SavedScenariosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Escenarios del usuario, más recientes primero; opcionalmente los de una calculadora. */
  async findAllByUser(userId: string, slug?: string): Promise<SavedScenarioResponse[]> {
    const conditions = [eq(savedScenarios.userId, userId)];
    if (slug) conditions.push(eq(savedScenarios.slug, slug));

    const rows = await this.db
      .select()
      .from(savedScenarios)
      .where(and(...conditions))
      .orderBy(desc(savedScenarios.updatedAt));

    return rows.map((row) => toResponse(row));
  }

  /** Guarda un escenario nuevo, aplicando los límites de tamaño y de cantidad. */
  async create(userId: string, dto: CreateSavedScenarioDto): Promise<SavedScenarioResponse> {
    this.assertInputsSize(dto.inputs);

    // Contar y luego insertar es check-then-act: dos altas simultáneas verían el mismo recuento y
    // superarían el tope. Un cerrojo transaccional por usuario las serializa. Clave de dos partes
    // (espacio 'saved_scenarios' + usuario) para no chocar con otros cerrojos por usuario, como
    // el de los snapshots.
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saved_scenarios'), hashtext(${userId}))`);
      await this.assertQuotaAvailable(tx, userId);
      const [inserted] = await tx
        .insert(savedScenarios)
        .values({ userId, slug: dto.slug, name: dto.name, inputs: dto.inputs })
        .returning();
      return inserted;
    });

    return toResponse(row);
  }

  /** Renombra o actualiza los `inputs` de un escenario del usuario. */
  async update(userId: string, id: string, dto: UpdateSavedScenarioDto): Promise<SavedScenarioResponse> {
    const current = await this.findOwned(userId, id);
    if (dto.inputs !== undefined) this.assertInputsSize(dto.inputs);

    const [row] = await this.db
      .update(savedScenarios)
      .set({
        name: dto.name ?? current.name,
        inputs: dto.inputs ?? current.inputs,
        updatedAt: new Date(),
      })
      .where(ownedScenario(userId, id))
      .returning();
    // Borrado entre la comprobación de propiedad y la escritura.
    if (!row) throw scenarioNotFound();

    return toResponse(row);
  }

  /** Borra un escenario del usuario (404 si no existe o es de otro). */
  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(savedScenarios)
      .where(ownedScenario(userId, id))
      .returning({ id: savedScenarios.id });
    if (deleted.length === 0) throw scenarioNotFound();
  }

  /** Localiza un escenario verificando propiedad. Centraliza el scoping por usuario. */
  private async findOwned(userId: string, id: string): Promise<SavedScenario> {
    const [row] = await this.db.select().from(savedScenarios).where(ownedScenario(userId, id));
    if (!row) {
      throw scenarioNotFound();
    }
    return row;
  }

  /**
   * Rechaza un `inputs` demasiado grande. Se mide sobre el JSON serializado en UTF-8, que es
   * exactamente lo que ocupará en la columna `jsonb`; medir claves o profundidad sería más
   * frágil y no acota el coste real.
   */
  private assertInputsSize(inputs: Record<string, unknown>): void {
    const bytes = Buffer.byteLength(JSON.stringify(inputs), 'utf8');
    if (bytes > MAX_INPUTS_BYTES) {
      throw new BadRequestException({
        code: 'INPUTS_TOO_LARGE',
        message: `Los datos del escenario superan el máximo de ${MAX_INPUTS_BYTES} bytes`,
      });
    }
  }

  /** Rechaza el alta si el usuario ya está en su tope de escenarios. */
  private async assertQuotaAvailable(tx: DatabaseOrTransaction, userId: string): Promise<void> {
    const [row] = await tx.select({ total: count() }).from(savedScenarios).where(eq(savedScenarios.userId, userId));

    if (row.total >= MAX_SCENARIOS_PER_USER) {
      throw new BadRequestException({
        code: 'SCENARIO_QUOTA_EXCEEDED',
        message: `Has alcanzado el máximo de ${MAX_SCENARIOS_PER_USER} escenarios guardados`,
      });
    }
  }
}

function toResponse(row: SavedScenario): SavedScenarioResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    inputs: row.inputs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Condición "el escenario `id` es de `userId`". Lecturas y escrituras por id la llevan siempre,
 * no solo la comprobación previa: defensa en profundidad entre usuarios.
 */
function ownedScenario(userId: string, id: string): SQL {
  return and(eq(savedScenarios.id, id), eq(savedScenarios.userId, userId)) as SQL;
}

function scenarioNotFound(): NotFoundException {
  return new NotFoundException('Escenario no encontrado');
}
