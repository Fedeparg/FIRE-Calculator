// Migraciones (`MIGRATION`): cambio de custodia entre entidades de TR, en parejas salida/entrada.

import { firstItem } from "../../arrays.js";
import { absUnits, formatUnits, parseUnits } from "../decimal.js";
import type { ImportWarning } from "../types.js";
import { ISIN, isValidDate, normalizeDatetime, type Row, type SkipFn } from "./rows.js";

/** Escala con la que se comparan cantidades de migraciones (el export trae hasta 10). */
const MIGRATION_SCALE = 10;

/**
 * Ventana en la que una salida y una entrada de migración cuentan como la misma. En un export
 * real las dos filas de una pareja difieren en unos pocos milisegundos (3-6 ms), no coinciden
 * al instante exacto; un segundo cubre ese desfase sin confundir migraciones distintas.
 */
const MIGRATION_PAIR_WINDOW_MS = 1_000;

/**
 * Empareja migraciones (salida + entrada con mismo ISIN y cantidad, casi al mismo instante).
 * Las parejas se descartan como `migration_pair`; las filas sueltas como `migration_unbalanced`
 * y generan un aviso, porque pueden esconder historial que falta o sobra. No reclaman su
 * `transaction_id`: nunca se importan.
 */
export function resolveMigrations(migrations: readonly Row[], skip: SkipFn): ImportWarning[] {
  type Leg = { row: Row; ms: number };
  const groups = new Map<string, { outgoing: Leg[]; incoming: Leg[] }>();
  const warnings: ImportWarning[] = [];

  for (const row of migrations) {
    const shares = parseUnits(row.shares, MIGRATION_SCALE);
    const executedAt = normalizeDatetime(row.datetime);
    if (!ISIN.test(row.symbol) || !isValidDate(row.date) || executedAt === null || shares === null || shares === 0n) {
      skip(row, "invalid_row");
      continue;
    }
    // `Date` solo llega al milisegundo: se recortan los microsegundos antes de parsear.
    const ms = new Date(`${executedAt.slice(0, 23)}Z`).getTime();
    const key = `${row.symbol}|${formatUnits(absUnits(shares), MIGRATION_SCALE)}`;
    const group = groups.get(key) ?? { outgoing: [], incoming: [] };
    (shares < 0n ? group.outgoing : group.incoming).push({ row, ms });
    groups.set(key, group);
  }

  for (const { outgoing, incoming } of groups.values()) {
    const unmatched = [...incoming].sort((a, b) => a.ms - b.ms || a.row.line - b.row.line);
    const loose: Leg[] = [];
    for (const out of [...outgoing].sort((a, b) => a.ms - b.ms || a.row.line - b.row.line)) {
      const at = unmatched.findIndex((leg) => Math.abs(leg.ms - out.ms) <= MIGRATION_PAIR_WINDOW_MS);
      if (at === -1) {
        loose.push(out);
        continue;
      }
      skip(out.row, "migration_pair");
      skip(firstItem(unmatched.splice(at, 1)).row, "migration_pair");
    }
    for (const { row } of [...loose, ...unmatched]) {
      skip(row, "migration_unbalanced");
      warnings.push({ code: "unbalanced_migration", isin: row.symbol, line: row.line });
    }
  }
  return warnings;
}
