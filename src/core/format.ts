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

// Cantidades de participaciones/acciones/cripto: hasta 6 decimales (la BD guarda
// `numeric(18,6)`), sin forzar decimales para que un entero se muestre limpio. Redondear
// a entero (como `formatNumber`) falsearía 1368,8 → "1.369" y ocultaría 0,5 BTC como "1".
const quantity = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const multiplier = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

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

/**
 * Cantidad de títulos de una posición (participaciones, acciones, cripto). A diferencia de
 * `formatNumber`, conserva hasta 6 decimales (la precisión con la que se almacena), así que
 * un fondo con 1368,8 participaciones o 0,5 BTC se muestran fielmente en lugar de redondear.
 */
export const formatQuantity = (n: number): string =>
  Number.isFinite(n) ? quantity.format(n) : NON_FINITE;

/** Coeficiente o multiplicador con 2-4 decimales (p. ej. 1,5882). */
export const formatMultiplier = (n: number): string =>
  Number.isFinite(n) ? multiplier.format(n) : NON_FINITE;

/** Notación compacta para ejes de gráficas ("1,2 M €"). */
export const formatCompactEUR = (n: number): string =>
  Number.isFinite(n) ? `${compact.format(n)} €` : NON_FINITE;

/** Recibe un porcentaje en base 100 (7 → "7 %"). */
export const formatPercent = (n: number): string =>
  Number.isFinite(n) ? pct.format(n / 100) : NON_FINITE;

// Caché de formateadores por divisa (Intl.NumberFormat es caro de crear).
const currencyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Moneda en una divisa arbitraria (EUR/USD/GBP/JPY…), para las posiciones de la cartera,
 * que pueden estar en distintas monedas. Mantiene es-ES como locale (separadores
 * españoles) variando solo el símbolo de divisa. Los decimales los decide `Intl` por
 * divisa (EUR/USD → 2, JPY → 0), así que no se hardcodean: forzar 2 rompería el yen.
 */
export const formatCurrency = (n: number, currency: string): string => {
  if (!Number.isFinite(n)) return NON_FINITE;
  let fmt = currencyFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency });
    currencyFormatters.set(currency, fmt);
  }
  return fmt.format(n);
};

// Caché de símbolos de divisa (Intl es caro; el símbolo es estable por divisa).
const currencySymbols = new Map<string, string>();

/**
 * Símbolo corto de una divisa ("€", "$", "£", "¥", "CHF"…) en locale es-ES. Útil para
 * etiquetas compactas (selector de divisas). OJO: varios símbolos colisionan ($ → USD/
 * CAD/AUD/HKD/SGD; ¥ → JPY/CNY), así que en la UI se acompaña SIEMPRE del código ISO.
 * Si la divisa no tiene símbolo propio (p. ej. CHF), `narrowSymbol` devuelve el código.
 */
export const currencySymbol = (currency: string): string => {
  let symbol = currencySymbols.get(currency);
  if (symbol === undefined) {
    const parts = new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    symbol = parts.find((p) => p.type === "currency")?.value ?? currency;
    currencySymbols.set(currency, symbol);
  }
  return symbol;
};

/**
 * Etiqueta compacta de una divisa para selectores: "€ EUR", "$ USD"… El código ISO va
 * SIEMPRE (los símbolos colisionan: $ → USD/CAD/AUD/HKD/SGD, ¥ → JPY/CNY). Si la divisa
 * no tiene símbolo propio (CHF), `currencySymbol` ya devuelve el código y no se duplica.
 */
export const currencyLabel = (currency: string): string => {
  const symbol = currencySymbol(currency);
  return symbol === currency ? currency : `${symbol} ${currency}`;
};

/** Reformatea una fecha ISO "YYYY-MM-DD" a "DD/MM/YYYY" sin construir un Date (sin desfase de zona). */
export const formatIsoDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
