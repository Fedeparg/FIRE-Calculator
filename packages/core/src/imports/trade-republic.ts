// Parser de la "Exportación de transacciones" (CSV) de Trade Republic. Lógica pura: recibe el
// texto y devuelve operaciones normalizadas, filas descartadas con su motivo y avisos.
//
// Privacidad: el export trae columnas con datos de terceros (contraparte, IBAN, referencia de
// pago, MCC) y un texto libre por fila (`description`). Aquí no se leen: se accede a las
// columnas por nombre y solo a las que hacen falta, así que esos datos mueren con el array
// `fields` de cada registro y no llegan a ningún resultado, log ni mensaje de error.
//
// Este fichero orquesta; cada tipo de fila tiene su módulo en `trade-republic/`.

import { compareStrings } from "../compare.js";
import { resolveBonusIssues } from "./trade-republic/bonus.js";
import { readDataRecords, TRADE_REPUBLIC_HEADER } from "./trade-republic/header.js";
import { INCOME_TYPES, resolveIncome } from "./trade-republic/income.js";
import { resolveMigrations } from "./trade-republic/migrations.js";
import { createImportContext, toRow, type Row } from "./trade-republic/rows.js";
import { parseTradeRow, skipReasonForType, type ParsedTrade, type TaxedBuy } from "./trade-republic/trades.js";
import type { ImportParseResult, ImportWarning } from "./types.js";

export {
  TRADE_REPUBLIC_HEADER,
  TradeRepublicParseError,
  type TradeRepublicParseErrorCode,
} from "./trade-republic/header.js";

/**
 * Parsea el export de transacciones de Trade Republic.
 *
 * Reglas (verificadas contra un export real):
 * - Se importan `BUY` y `SELL`. El importe bruto es `cantidad × precio`; la columna `amount`
 *   no se usa (hay una compra antigua con `amount` y `fee` vacíos que sigue siendo válida).
 * - `fee` es coste de la operación y se guarda en valor absoluto. `tax` no se suma al coste. En
 *   las compras de un saveback es la retención del 19 % de la recompensa y pasa a su cobro (ver
 *   `resolveIncome`); del resto solo se avisa de cuántas operaciones la traen.
 * - `INTEREST_PAYMENT`, `BENEFITS_SAVEBACK`, `STOCKPERK` y `DIVIDEND` son cobros (`income`). La
 *   recompensa llega además como una `BUY` aparte por el mismo importe: esa compra entra con su
 *   coste. Las retenciones de un dividendo se reparten con `resolveFromBroker`.
 * - `date` manda sobre `datetime` como fecha de operación: puede diferir del día UTC.
 * - Las `MIGRATION` (cambio de custodia) vienen en parejas salida/entrada con el mismo ISIN y
 *   cantidad, a pocos milisegundos entre sí, y efecto neto cero: se ignoran las parejas y se avisa de las sueltas.
 * - Las `BONUS_ISSUE` (ampliación liberada: acciones nuevas gratis) entran como compra a precio
 *   0; una `BONUS_ISSUE_CANCELLED` anula la emisión anterior del mismo ISIN y cantidad (TR a
 *   veces cancela una y la vuelve a emitir). Ver `resolveBonusIssues`.
 * - El resto de tipos, los cripto y las divisas distintas de EUR se descartan con motivo; un
 *   tipo desconocido nunca hace fallar la importación.
 *
 * @throws {TradeRepublicParseError} si el fichero entero no es utilizable.
 */
export function parseTradeRepublicCsv(text: string): ImportParseResult {
  const dataRecords = readDataRecords(text);
  const { context, skipped } = createImportContext();

  const parsed: ParsedTrade[] = [];
  const migrations: Row[] = [];
  const bonusIssues: Row[] = [];
  const incomeRows: Row[] = [];
  const taxedBuys: TaxedBuy[] = [];
  let tradesWithTax = 0;

  for (const record of dataRecords) {
    if (record.fields.length !== TRADE_REPUBLIC_HEADER.length) {
      context.skip({ line: record.line, type: "" }, "invalid_row");
      continue;
    }
    const row = toRow(record);

    if (row.type === "MIGRATION") {
      migrations.push(row);
    } else if (row.type === "BONUS_ISSUE" || row.type === "BONUS_ISSUE_CANCELLED") {
      bonusIssues.push(row);
    } else if (INCOME_TYPES.has(row.type)) {
      incomeRows.push(row);
    } else if (row.type !== "BUY" && row.type !== "SELL") {
      context.skip(row, skipReasonForType(row.type));
    } else {
      const result = parseTradeRow(row, context);
      if (!result) continue;
      parsed.push(result.parsed);
      if (result.tax !== 0n) tradesWithTax++;
      if (result.taxedBuy) taxedBuys.push(result.taxedBuy);
    }
  }

  // El orden importa: cada resolutor reclama los `transaction_id` que acepta (ver `ImportContext`).
  parsed.push(...resolveBonusIssues(bonusIssues, context));
  const { income, buysWithBenefitTax } = resolveIncome(incomeRows, migrations, taxedBuys, context);

  const warnings: ImportWarning[] = [...resolveMigrations(migrations, context.skip)];
  // La retención de un saveback que TR anota en la compra asociada ya está en el cobro: no se avisa.
  if (tradesWithTax - buysWithBenefitTax > 0) {
    warnings.push({ code: "trade_tax_ignored", count: tradesWithTax - buysWithBenefitTax });
  }

  // Estable: ante el mismo instante, el orden del fichero.
  parsed.sort((a, b) => compareStrings(a.trade.executedAt, b.trade.executedAt) || a.line - b.line);
  const trades = parsed.map(({ trade }) => trade);
  skipped.sort((a, b) => a.line - b.line);

  return { trades, income, skipped, warnings };
}
