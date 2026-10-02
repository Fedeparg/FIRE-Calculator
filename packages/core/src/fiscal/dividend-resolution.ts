// Reparto de un dividendo importado en íntegro, retención en origen y retención española, con la
// procedencia de cada cifra. Core puro. Tres capas, de más a menos fiable:
//   1. `resolveFromBroker`: aritmética sobre lo que dice el bróker.
//   2. `resolveWithMarket`: contraste con el dividendo por acción de mercado × acciones.
//   3. `estimateWithStatutoryRate`: tipo que retiene por ley el país, marcado como estimación.
// Criterio y fuentes: ver ./README.md, sección `dividend-resolution.ts`.

import type { ValueSource } from "./income.js";

/** Retención española sobre rendimientos del capital mobiliario (art. 90 RIRPF). */
export const SPANISH_WITHHOLDING_RATE = 0.19;

/**
 * Retención en origen que el bróker aplica de hecho y coincide con el convenio, para deshacer la
 * mezcla de retenciones del export de Trade Republic: EE. UU. con el W-8BEN (confirmado con 21
 * dividendos reales contra el informe fiscal de TR) y Países Bajos (ASML), 15 %.
 */
const BROKER_ORIGIN_RATES: Readonly<Record<string, number>> = { US: 0.15, NL: 0.15 };

/** Margen para comparar importes que el bróker redondea a céntimos en cada paso. */
const CENT_TOLERANCE = 0.011;

/** Una retención en origen por encima de esto no es verosímil: el dato de mercado no casa. */
const MAX_PLAUSIBLE_ORIGIN_RATE = 0.4;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Lo que dice el bróker de un dividendo. Importes en euros salvo `originalAmount`. */
export interface DividendFacts {
  /** Abonado, en euros. */
  amount: number;
  /** Retenciones que el bróker anota en la fila, en euros y en valor absoluto. */
  tax: number;
  /** Abonado en la divisa de pago, si no era el euro. */
  originalAmount: number | null;
  /** El bróker ya retiene en España (sucursal española): aplica el 19 % sobre lo cobrado. */
  reported: boolean;
  /** País del emisor (prefijo del ISIN). */
  country: string;
}

export interface DividendResolution {
  gross: number;
  /** `null` si no se puede saber. */
  origin: number | null;
  spain: number;
  grossSource: ValueSource;
  /** `null` mientras `origin` sea `null`. */
  originSource: ValueSource | null;
}

/**
 * Capa 1. El significado de `amount` y `tax` cambia con el periodo y el emisor (verificado contra
 * los informes fiscales de Trade Republic):
 *
 * - Antes de la sucursal española: `amount` es el íntegro y `tax`, la retención en origen.
 * - Después, España retiene el 19 % de lo cobrado neto de origen. `tax/amount` ≈ 19 %: `amount`
 *   llegó neto de origen y `tax` es solo la española (ASML). ≈ origen + 19 % del resto: `amount` es
 *   el íntegro y `tax` suma las dos (EE. UU.).
 *
 * Deshacer un neto con un tipo supuesto es una estimación hasta que lo confirme el mercado.
 */
export function resolveFromBroker({ amount, tax, country, reported }: DividendFacts): DividendResolution {
  const rate = BROKER_ORIGIN_RATES[country];
  if (tax === 0) {
    if (country === "ES") return { gross: amount, origin: 0, spain: 0, grossSource: "broker", originSource: "broker" };
    // Tan pequeño que la retención de origen redondearía a 0 céntimos.
    if (rate !== undefined && round2(Math.abs(amount) * rate) === 0) {
      return { gross: amount, origin: 0, spain: 0, grossSource: "broker", originSource: "derived" };
    }
    return { gross: amount, origin: null, spain: 0, grossSource: "broker", originSource: null };
  }
  if (!reported) return { gross: amount, origin: tax, spain: 0, grossSource: "broker", originSource: "broker" };

  if (Math.abs(tax - SPANISH_WITHHOLDING_RATE * amount) <= CENT_TOLERANCE) {
    if (country === "ES")
      return { gross: amount, origin: 0, spain: tax, grossSource: "broker", originSource: "broker" };
    if (rate === undefined)
      return { gross: amount, origin: null, spain: tax, grossSource: "broker", originSource: null };
    const gross = round2(amount / (1 - rate));
    return { gross, origin: round2(gross - amount), spain: tax, grossSource: "estimate", originSource: "estimate" };
  }
  if (
    rate !== undefined &&
    Math.abs(tax - (rate + SPANISH_WITHHOLDING_RATE * (1 - rate)) * amount) <= 2 * CENT_TOLERANCE
  ) {
    // Se reproduce el redondeo del bróker (origen a céntimos, España el resto): despejarlo
    // algebraicamente falla por un céntimo en importes pequeños.
    const origin = round2(rate * amount);
    return { gross: amount, origin, spain: round2(tax - origin), grossSource: "broker", originSource: "derived" };
  }
  // Sin clasificar: la española no puede pasar del 19 % de lo cobrado; el origen, sin saber.
  return {
    gross: amount,
    origin: null,
    spain: Math.min(tax, round2(SPANISH_WITHHOLDING_RATE * amount)),
    grossSource: "broker",
    originSource: null,
  };
}

/**
 * Capa 2. `marketGross` = acciones × dividendo por acción de mercado, en la divisa de pago. Si
 * coincide con lo abonado, el bróker dio el íntegro; si es mayor, lo abonado llegó neto y la
 * diferencia es la retención en origen, sea cual sea el país. Se compara en la divisa de pago (no
 * en euros: mezclaría el cambio del bróker con el del BCE) y lo derivado se pasa a euros con el
 * cambio implícito del bróker, para que íntegro, retenciones y neto cuadren. `null` si el dato de
 * mercado no casa (menor que lo abonado, o una retención inverosímil).
 */
export function resolveWithMarket(facts: DividendFacts, marketGross: number): DividendResolution | null {
  const paid = facts.originalAmount ?? facts.amount;
  if (!(marketGross > 0) || !(paid > 0)) return null;
  const tolerance = Math.max(CENT_TOLERANCE, 0.005 * marketGross);
  if (marketGross < paid - tolerance) return null;

  const fx = facts.amount / paid;
  if (Math.abs(marketGross - paid) <= tolerance) {
    // Lo abonado es el íntegro: lo que retuvo el bróker es todo lo que hubo.
    const broker = resolveFromBroker(facts);
    if (broker.origin !== null && broker.originSource !== "estimate") return broker;
    const spain = facts.reported ? Math.min(facts.tax, round2(SPANISH_WITHHOLDING_RATE * facts.amount)) : 0;
    const origin = round2(Math.max(0, facts.tax - spain));
    return { gross: facts.amount, origin, spain, grossSource: "market", originSource: "market" };
  }

  const gross = round2(marketGross * fx);
  const origin = round2(gross - facts.amount);
  if (origin / gross > MAX_PLAUSIBLE_ORIGIN_RATE) return null;
  return { gross, origin, spain: facts.reported ? facts.tax : 0, grossSource: "market", originSource: "market" };
}

/**
 * Capa 3. Sin dato de mercado, supone que lo abonado llegó neto del tipo que retiene por ley el
 * país (`statutoryRate`, con su fuente en `withholding-rates.ts`). Es una estimación y así se marca.
 */
export function estimateWithStatutoryRate(facts: DividendFacts, statutoryRate: number): DividendResolution {
  const spain = facts.reported ? facts.tax : 0;
  const gross = round2(facts.amount / (1 - statutoryRate));
  return { gross, origin: round2(gross - facts.amount), spain, grossSource: "estimate", originSource: "estimate" };
}
