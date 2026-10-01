// Tarjeta de crédito (deuda revolving): amortización mes a mes. Core puro. Modos de pago: "fixed"
// (cuota fija) y "percent" (mínimo como % del saldo con suelo en euros; sin suelo la cuota tiende a 0
// y la deuda no termina).

export const PAYMENT_MODES = ["fixed", "percent"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface CreditCardInput {
  balance: number;
  annualRate: number;
  paymentMode?: PaymentMode;
  monthlyPayment: number;
  minPercent?: number;
  minFloor?: number;
}

export interface CreditCardPoint {
  // firma de índice numérica: consumible como dato de gráfica
  [key: string]: number;
  month: number;
  balance: number;
  interestPaid: number;
}

export interface CreditCardResult {
  monthsToPayoff: number | null;
  totalInterest: number;
  totalPaid: number;
  firstPayment: number;
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

  // sin suelo, en modo "percent" la deuda nunca termina
  if (mode === "percent" && minFloor <= 0) return NEVER;
  // en modo "fixed", si el pago no cubre los intereses del primer mes la deuda nunca baja
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
