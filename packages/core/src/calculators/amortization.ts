// Matemática de préstamos a cuota constante (amortización francesa), compartida por hipoteca,
// amortización anticipada, hipoteca asequible y tarjeta de crédito. Core puro.

/** Tipo mensual (fracción, no %) a partir del TIN anual en base 100 (3 = 3 %). NaN cuenta como 0. */
export function monthlyRate(annualPercent: number): number {
  return (annualPercent || 0) / 100 / 12;
}

/**
 * Cuota constante que amortiza `principal` en `months` pagos al tipo mensual `rate`. Con tipo 0 la
 * fórmula francesa es 0/0, así que se reparte el capital a partes iguales.
 */
export function levelPayment(principal: number, rate: number, months: number): number {
  return rate === 0 ? principal / months : (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

/** Inversa de `levelPayment`: capital que financia una cuota `payment` durante `months` pagos. */
export function presentValueOfPayments(payment: number, rate: number, months: number): number {
  return rate === 0 ? payment * months : (payment * (1 - Math.pow(1 + rate, -months))) / rate;
}

export interface AmortizationMonth {
  /** Número de mes, desde 1. */
  month: number;
  /** Saldo vivo al empezar el mes. */
  balanceBefore: number;
  interest: number;
  /**
   * Capital que amortiza la cuota: `payment − interest`, sin acotar. Puede ser negativo (la cuota no
   * cubre los intereses) o exceder el saldo en el último pago; el consumidor decide qué hacer.
   */
  principalPart: number;
  /** Saldo al acabar el mes, nunca negativo. */
  balanceAfter: number;
}

/**
 * Recorre el calendario mes a mes (hasta `maxMonths`). Es un generador para que cada consumidor
 * corte cuando le convenga (p. ej. al liquidarse el saldo) sin que el recorrido conozca esa regla.
 */
export function* amortizationSchedule(
  principal: number,
  rate: number,
  payment: number,
  maxMonths: number,
): Generator<AmortizationMonth, void, undefined> {
  let balance = principal;
  for (let month = 1; month <= maxMonths; month++) {
    const interest = balance * rate;
    const principalPart = payment - interest;
    const balanceAfter = Math.max(0, balance - principalPart);
    yield { month, balanceBefore: balance, interest, principalPart, balanceAfter };
    balance = balanceAfter;
  }
}
