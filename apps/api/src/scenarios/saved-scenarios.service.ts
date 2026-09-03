import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { savedScenarios, type SavedScenario } from '../db/schema.js';
import { CreateSavedScenarioDto } from './dto/create-saved-scenario.dto.js';
import { UpdateSavedScenarioDto } from './dto/update-saved-scenario.dto.js';

/**
 * Tope de tamaño de `inputs`, medido en bytes UTF-8 del JSON serializado. 8 KiB sobran para
 * el formulario más largo de las calculadoras (decenas de campos numéricos) y cierran la
 * puerta a usar la cuenta como almacén de ficheros.
 */
export const MAX_INPUTS_BYTES = 8 * 1024;

/**
 * Tope de escenarios por usuario. Es una conveniencia de la cuenta ("mi plan a los 45", "mi
 * plan pesimista"), no un gestor documental: 50 es holgado para el uso real y acota el coste
 * de un usuario que automatizase el guardado.
 */
export const MAX_SCENARIOS_PER_USER = 50;

/** Escenario tal y como lo consume el frontend (fechas como ISO string). */
export type SavedScenarioResponse = {
  id: string;
  slug: string;
  name: string;
  inputs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/**
 * Escenarios guardados de calculadora. Mismo patrón de aislamiento que `positions`: el
 * `userId` viene SIEMPRE del JWT y toda consulta filtra por él; por id, 404 si no existe y
 * 403 si es de otro usuario.
 */
@Injectable()
export class SavedScenariosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Escenarios del usuario, más recientes primero; opcionalmente los de UNA calculadora. */
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
    await this.assertQuotaAvailable(userId);

    const [row] = await this.db
      .insert(savedScenarios)
      .values({ userId, slug: dto.slug, name: dto.name, inputs: dto.inputs })
      .returning();

    return toResponse(row);
  }

  /** Renombra o actualiza los `inputs` de un escenario del usuario. */
  async update(
    userId: string,
    id: string,
    dto: UpdateSavedScenarioDto,
  ): Promise<SavedScenarioResponse> {
    const current = await this.findOwned(userId, id);
    if (dto.inputs !== undefined) this.assertInputsSize(dto.inputs);

    const [row] = await this.db
      .update(savedScenarios)
      .set({
        name: dto.name ?? current.name,
        inputs: dto.inputs ?? current.inputs,
        updatedAt: new Date(),
      })
      .where(eq(savedScenarios.id, id))
      .returning();

    return toResponse(row);
  }

  /** Borra un escenario del usuario (404 si no existe, 403 si es de otro). */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db.delete(savedScenarios).where(eq(savedScenarios.id, id));
  }

  /** Localiza un escenario verificando propiedad. Centraliza el scoping por usuario. */
  private async findOwned(userId: string, id: string): Promise<SavedScenario> {
    const [row] = await this.db.select().from(savedScenarios).where(eq(savedScenarios.id, id));
    if (!row) {
      throw new NotFoundException('Escenario no encontrado');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('No puedes acceder a un escenario que no es tuyo');
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
  private async assertQuotaAvailable(userId: string): Promise<void> {
    const [row] = await this.db
      .select({ total: count() })
      .from(savedScenarios)
      .where(eq(savedScenarios.userId, userId));

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
