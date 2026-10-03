// Intereses, recompensas (saveback, stockperk) y dividendos → cobros.

import { firstItem } from "../../arrays.js";
import { compareStrings } from "../../compare.js";
import { addDays } from "../../dates.js";
import { resolveFromBroker } from "../../fiscal/dividend-resolution.js";
import { absUnits } from "../decimal.js";
import type { ImportedIncome } from "../types.js";
import {
  amountUnits,
  claimTransactionId,
  decimalOf,
  formatAmount,
  ISIN,
  isValidDate,
  type ImportContext,
  type Row,
} from "./rows.js";
import type { TaxedBuy } from "./trades.js";

/** Tipos de fila que son cobros. */
export const INCOME_TYPES: ReadonlySet<string> = new Set([
  "INTEREST_PAYMENT",
  "BENEFITS_SAVEBACK",
  "STOCKPERK",
  "DIVIDEND",
]);

/**
 * Anulaciones de dividendos: TR a veces abona un dividendo provisional y luego lo anula con la
 * misma cantidad en negativo antes de abonar el definitivo. Cada anulación se empareja con el
 * abono anterior del mismo ISIN e importe y se descartan los dos.
 */
function reversedDividends(rows: readonly Row[]): Set<Row> {
  const dropped = new Set<Row>();
  const dividends = rows.filter((row) => row.type === "DIVIDEND");
  for (const reversal of dividends) {
    const amount = amountUnits(reversal.amount);
    if (amount === null || amount >= 0n) continue;
    const original = dividends.findLast(
      (row) =>
        !dropped.has(row) &&
        row !== reversal &&
        row.symbol === reversal.symbol &&
        row.date <= reversal.date &&
        amountUnits(row.amount) === -amount,
    );
    if (original) {
      dropped.add(original);
      dropped.add(reversal);
    }
  }
  return dropped;
}

/**
 * Día del cambio de custodia a la sucursal española de TR, o `null`. Desde el día siguiente TR
 * retiene en España e informa a la AEAT (modelos 187, 189, 193, 196…): esos cobros salen en el
 * borrador. Se reconoce por las filas `MIGRATION` (traspaso de valores entre las dos entidades);
 * sin ellas, por el primer interés con retención española (cuenta española desde el principio).
 */
function spanishBranchCutoff(
  migrations: readonly Row[],
  incomeRows: readonly Row[],
): { date: string; inclusive: boolean } | null {
  const migrationDates = migrations.map((row) => row.date).filter(isValidDate);
  if (migrationDates.length > 0) return { date: migrationDates.sort().at(-1) as string, inclusive: false };
  const withheld = incomeRows
    .filter((row) => row.type === "INTEREST_PAYMENT" && isValidDate(row.date) && (amountUnits(row.tax) ?? 0n) !== 0n)
    .map((row) => row.date)
    .sort();
  return withheld.length > 0 ? { date: firstItem(withheld), inclusive: true } : null;
}

/** Cobro de un dividendo: las retenciones se reparten con `resolveFromBroker`. */
function dividendIncome(row: Row, amount: bigint, tax: bigint, isReported: boolean): ImportedIncome {
  const country = row.symbol.slice(0, 2);
  const shares = amountUnits(row.shares);
  const original = row.originalCurrency === "" ? null : amountUnits(row.originalAmount);
  const originalCurrency = original !== null && /^[A-Z]{3}$/.test(row.originalCurrency) ? row.originalCurrency : null;
  const split = resolveFromBroker({
    amount: Number(formatAmount(amount)),
    tax: Number(formatAmount(tax)),
    originalAmount: originalCurrency && original !== null ? Number(formatAmount(original)) : null,
    reported: isReported,
    country,
  });
  return {
    externalId: row.transactionId,
    kind: "dividend",
    paidAt: row.date,
    isin: row.symbol,
    name: row.name || null,
    country,
    currency: "EUR",
    gross: decimalOf(split.gross),
    withholdingOrigin: split.origin === null ? null : decimalOf(split.origin),
    withholdingSpain: decimalOf(split.spain),
    reportedToAeat: isReported,
    grossSource: split.grossSource,
    withholdingOriginSource: split.originSource,
    quantity: shares !== null && shares > 0n ? formatAmount(shares) : null,
    originalAmount: originalCurrency && original !== null ? formatAmount(original) : null,
    originalCurrency,
  };
}

/** Cobro de un interés o una recompensa, con el pagador según la sucursal. */
function interestOrBenefitIncome(row: Row, amount: bigint, tax: bigint, isReported: boolean): ImportedIncome {
  // La sucursal española comunica a la AEAT los intereses del mes con fecha de su último día,
  // aunque los abone el día 1 del siguiente: así el de diciembre cuenta en su año, como en el borrador.
  const paidAt =
    row.type === "INTEREST_PAYMENT" && isReported && row.date.endsWith("-01") ? addDays(row.date, -1) : row.date;
  return {
    externalId: row.transactionId,
    kind: row.type === "INTEREST_PAYMENT" ? "interest" : "benefit",
    paidAt,
    isin: null,
    name: null,
    country: isReported ? "ES" : "DE",
    currency: "EUR",
    gross: formatAmount(amount),
    withholdingOrigin: "0",
    withholdingSpain: formatAmount(tax),
    reportedToAeat: isReported,
    grossSource: "broker",
    withholdingOriginSource: "broker",
    quantity: null,
    originalAmount: null,
    originalCurrency: null,
  };
}

/**
 * Intereses y recompensas (saveback, stockperk) → cobros. TR declara las recompensas como
 * intereses, con su retención del 19 %. Entre julio y noviembre de 2025 esa retención no venía en
 * la fila del saveback sino en la compra que lo invierte (mismo día e importe): se toma de ahí
 * (y se consume de `taxedBuys`). Antes del cambio a la sucursal española no hay retención ni
 * comunicación a la AEAT, y el pagador es TR Alemania (país `DE`); después, España.
 */
export function resolveIncome(
  rows: readonly Row[],
  migrations: readonly Row[],
  taxedBuys: TaxedBuy[],
  context: ImportContext,
): { income: ImportedIncome[]; buysWithBenefitTax: number } {
  const cutoff = spanishBranchCutoff(migrations, rows);
  const reported = (date: string) => cutoff !== null && (cutoff.inclusive ? date >= cutoff.date : date > cutoff.date);
  const income: { item: ImportedIncome; line: number }[] = [];
  let buysWithBenefitTax = 0;
  const reversed = reversedDividends(rows);

  for (const row of rows) {
    if (reversed.has(row)) {
      context.skip(row, "dividend_reversed");
      continue;
    }
    const amount = amountUnits(row.amount);
    const ownTax = row.tax === "" ? 0n : amountUnits(row.tax);
    if (
      !isValidDate(row.date) ||
      row.transactionId === "" ||
      amount === null ||
      ownTax === null ||
      row.currency !== "EUR" ||
      (row.type === "DIVIDEND" && !ISIN.test(row.symbol))
    ) {
      context.skip(row, "invalid_row");
      continue;
    }
    if (!claimTransactionId(row, context)) continue;

    let tax = absUnits(ownTax);
    if (row.type !== "INTEREST_PAYMENT" && tax === 0n) {
      const at = taxedBuys.findIndex((buy) => buy.row.date === row.date && buy.amount === amount);
      if (at !== -1) {
        tax = absUnits(firstItem(taxedBuys.splice(at, 1)).tax);
        buysWithBenefitTax++;
      }
    }

    const isReported = reported(row.date);
    const item =
      row.type === "DIVIDEND"
        ? dividendIncome(row, amount, tax, isReported)
        : interestOrBenefitIncome(row, amount, tax, isReported);
    income.push({ item, line: row.line });
  }

  income.sort((a, b) => compareStrings(a.item.paidAt, b.item.paidAt) || a.line - b.line);
  return { income: income.map(({ item }) => item), buysWithBenefitTax };
}
