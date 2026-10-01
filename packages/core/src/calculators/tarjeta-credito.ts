// Intereses de tarjeta de crédito (deuda revolving). Simula la amortización mes
// a mes. Core puro.
//
// Soporta dos modos de pago:
//  - "fixed": cuota mensual fija (lo que pagas cada mes no cambia).
//  - "percent": cuota mínima como % del saldo, con un suelo en euros. Es el modo
//    típico de las tarjetas revolving: al bajar el saldo baja la cuota, por lo
//    que la deuda dura años. El suelo garantiza que la deuda termina por saldarse.

/** Formas de pago mensual de la tarjeta: cuota fija o porcentaje del saldo. */
export const PAYMENT_MODES = ["fixed", "percent"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface CreditCardInput {
  /** Saldo pendiente (deuda). */
  balance: number;
  /** Tipo de interés anual (TIN/TAE), en base 100 (20 = 20 %). */
  annualRate: number;
  /** Modo de pago. Por defecto "fixed". */
  paymentMode?: PaymentMode;
  /** Pago mensual fijo (modo "fixed"). */
  monthlyPayment: number;
  /** Cuota mínima como % del saldo (modo "percent"), en base 100 (3 = 3 %). */
  minPercent?: number;
  /** Suelo de la cuota mínima en euros (modo "percent"). Garantiza que termina. */
  minFloor?: number;
}

export interface CreditCardPoint {
  // Firma de índice numérica para consumirlo como dato genérico de gráfica.
  [key: string]: number;
  /** Mes (0 = inicio). */
  month: number;
  /** Saldo pendiente al final del mes. */
  balance: number;
  /** Intereses acumulados pagados hasta ese mes. */
  interestPaid: number;
}

export interface CreditCardResult {
  /** Meses hasta saldar la deuda, o null si el pago no cubre ni los intereses. */
  monthsToPayoff: number | null;
  /** Intereses totales pagados. */
  totalInterest: number;
  /** Total pagado (principal + intereses). */
  totalPaid: number;
  /** Primera cuota mensual (informativa, útil en modo "percent"). */
  firstPayment: number;
  /** Evolución del saldo mes a mes (vacía si la deuda no se salda). */
  series: CreditCardPoint[];
}

const MAX_MONTHS = 1200;

const NEVER: CreditCardResult = {
  monthsToPayoff: null,
  totalInterest: Infinity,
  totalPaid: Infinity,
  firstPayment: 0,
  series: [],
};

export function computeCreditCard(input: CreditCardInput): CreditCardResult {
  const balance = Math.max(0, input.balance || 0);
  const monthlyRate = (input.annualRate || 0) / 100 / 12;
  const mode: PaymentMode = input.paymentMode ?? "fixed";
  const fixedPayment = Math.max(0, input.monthlyPayment || 0);
  const minPercent = Math.max(0, input.minPercent || 0) / 100;
  const minFloor = Math.max(0, input.minFloor || 0);

  if (balance === 0) {
    return {
      monthsToPayoff: 0,
      totalInterest: 0,
      totalPaid: 0,
      firstPayment: 0,
      series: [{ month: 0, balance: 0, interestPaid: 0 }],
    };
  }

  // En modo "percent" sin suelo, la cuota tiende a 0 con el saldo y la deuda
  // nunca termina; el suelo es imprescindible para que se salde.
  if (mode === "percent" && minFloor <= 0) return NEVER;
  // En modo "fixed", si el pago no cubre ni los intereses del primer mes, la
  // deuda nunca baja.
  if (mode === "fixed" && fixedPayment <= balance * monthlyRate) return NEVER;

  let remaining = balance;
  let totalInterest = 0;
  let months = 0;
  let firstPayment = 0;
  const series: CreditCardPoint[] = [{ month: 0, balance: round2(balance), interestPaid: 0 }];

  while (remaining > 0 && months < MAX_MONTHS) {
    const interest = remaining * monthlyRate;
    totalInterest += interest;
    const due = remaining + interest;

    const scheduled = mode === "percent" ? Math.max(minFloor, remaining * minPercent) : fixedPayment;
    const pay = Math.min(scheduled, due);

    remaining = due - pay;
    months++;
    if (months === 1) firstPayment = pay;

    series.push({
      month: months,
      balance: round2(Math.max(0, remaining)),
      interestPaid: round2(totalInterest),
    });
  }

  if (remaining > 1e-6) return NEVER;

  return {
    monthsToPayoff: months,
    totalInterest,
    totalPaid: balance + totalInterest,
    firstPayment,
    series,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
