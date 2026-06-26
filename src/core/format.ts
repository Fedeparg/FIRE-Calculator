// Formato localizado para España (es-ES, EUR). Core puro.

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurCents = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

const compact = new Intl.NumberFormat("es-ES", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const pct = new Intl.NumberFormat("es-ES", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Marcador para valores no representables (Infinity, NaN, divisiones por cero).
 * Centralizar esto evita que cada calculadora invente su propio guard y que un
 * resultado indefinido se cuele como "0 €", que sería engañoso.
 */
const NON_FINITE = "—";

/** Moneda sin decimales (cifras grandes: patrimonio, totales). */
export const formatEUR = (n: number): string =>
  Number.isFinite(n) ? eur.format(n) : NON_FINITE;

/** Moneda con 2 decimales (cuotas, importes pequeños). */
export const formatEURCents = (n: number): string =>
  Number.isFinite(n) ? eurCents.format(n) : NON_FINITE;

export const formatNumber = (n: number): string =>
  Number.isFinite(n) ? num.format(n) : NON_FINITE;

/** Notación compacta para ejes de gráficas ("1,2 M €"). */
export const formatCompactEUR = (n: number): string =>
  Number.isFinite(n) ? `${compact.format(n)} €` : NON_FINITE;

/** Recibe un porcentaje en base 100 (7 → "7 %"). */
export const formatPercent = (n: number): string =>
  Number.isFinite(n) ? pct.format(n / 100) : NON_FINITE;
