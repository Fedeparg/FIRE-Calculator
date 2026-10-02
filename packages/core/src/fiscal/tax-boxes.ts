// Casillas del modelo 100 (IRPF) por ejercicio, para presentar cada cifra con la casilla en la
// que se declara. Cambian cada año: un ejercicio sin tabla se muestra sin números de casilla.
// Fuente y criterio: ver ./README.md, sección `tax-boxes.ts`.

/** Casillas de la base del ahorro que usa el informe. */
export interface TaxBoxes {
  /** Disposición que aprueba el modelo del ejercicio. */
  source: string;
  interest: string;
  dividends: string;
  /** Gastos de administración y depósito de valores negociables. */
  custodyFees: string;
  /** Retenciones e ingresos a cuenta del capital mobiliario. */
  capitalWithholding: string;
  /** Acciones admitidas a negociación, por entidad emisora. */
  shares: { entity: string; transferValue: string; acquisitionValue: string; gains: string; losses: string };
  /** Fondos y ETF (IIC) no sujetos a retención: típicamente extranjeros (art. 75.3.j RIRPF). */
  fundsWithoutWithholding: {
    name: string;
    transferValue: string;
    acquisitionValue: string;
    gains: string;
    losses: string;
  };
  /** Otros elementos patrimoniales: rango del bloque (aquí van los derivados, por exclusión). */
  otherAssets: string;
  /** Compensación del saldo negativo de rendimientos con ganancias (25 %) y al revés. */
  crossCompensation: { capitalIncomeWithGains: string; gainsWithCapitalIncome: string };
  /** Saldos negativos pendientes de los cuatro ejercicios anteriores, del más antiguo al más reciente. */
  pendingGains: readonly string[];
  pendingCapitalIncome: readonly string[];
  doubleTaxation: string;
}

/**
 * Por ejercicio. 2025: Orden HAC/277/2026, de 25 de marzo (BOE-A-2026-7041), números leídos del
 * propio formulario del modelo y contrastados con el Manual práctico de Renta 2025 de la AEAT.
 */
const TAX_BOXES: Readonly<Record<number, TaxBoxes>> = {
  2025: {
    source: "Orden HAC/277/2026 (BOE-A-2026-7041)",
    interest: "0027",
    dividends: "0029",
    custodyFees: "0037",
    capitalWithholding: "0597",
    shares: { entity: "0327", transferValue: "0328", acquisitionValue: "0331", gains: "0332", losses: "0338" },
    fundsWithoutWithholding: {
      name: "2226",
      transferValue: "2227",
      acquisitionValue: "2229",
      gains: "2230",
      losses: "2233",
    },
    otherAssets: "1624-1654",
    crossCompensation: { capitalIncomeWithGains: "0436", gainsWithCapitalIncome: "0446" },
    pendingGains: ["0439", "0440", "0441", "0442"],
    pendingCapitalIncome: ["0449", "0450", "0451", "0452"],
    doubleTaxation: "0588",
  },
};

/** Casillas del ejercicio, o `null` si no están verificadas para ese año. */
export function taxBoxesFor(year: number): TaxBoxes | null {
  return TAX_BOXES[year] ?? null;
}
