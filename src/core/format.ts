// Formato localizado. Core puro (sin React), parametrizado por idioma.
//
// El idioma de la UI (`es` | `en`) determina el locale de `Intl`: `es-ES` (separador de
// miles ".", decimal ",", y sin agrupar las cifras de 4 dígitos, según la norma española)
// y `en-GB` (agrupa siempre desde 4 dígitos: "£2,000.00"). Los componentes obtienen el
// juego de formateadores del idioma activo con el hook `useFormat()` (ver `@/lib/format`).
//
// `getFormatters(locale)` memoiza un juego por idioma: `Intl.NumberFormat` es caro de crear,
// así que se construye una sola vez por locale y se reutiliza en todos los renders.

import { type Locale } from "./types";

/** Idioma de la UI → locale de `Intl`. `en-GB` y `en-US` son idénticos para números/moneda. */
const INTL_LOCALE: Record<Locale, string> = { es: "es-ES", en: "en-GB" };

/**
 * Marcador para valores no representables (Infinity, NaN, divisiones por cero).
 * Centralizar esto evita que cada calculadora invente su propio guard y que un
 * resultado indefinido se cuele como "0 €", que sería engañoso.
 */
const NON_FINITE = "—";

/** Juego de formateadores ya ligados a un idioma. Lo devuelve `getFormatters` / `useFormat`. */
export interface Formatters {
  /** Moneda (EUR) sin decimales (cifras grandes: patrimonio, totales). */
  formatEUR: (n: number) => string;
  /** Moneda (EUR) con 2 decimales (cuotas, importes pequeños). */
  formatEURCents: (n: number) => string;
  /** Número entero con separador de miles del idioma. */
  formatNumber: (n: number) => string;
  /** Cantidad de títulos (participaciones, acciones, cripto): hasta 6 decimales. */
  formatQuantity: (n: number) => string;
  /** Coeficiente o multiplicador con 2-4 decimales (p. ej. 1,5882). */
  formatMultiplier: (n: number) => string;
  /** Notación compacta para ejes de gráficas ("1,2 M €"). */
  formatCompactEUR: (n: number) => string;
  /** Notación compacta en una divisa arbitraria, para ejes de gráficas en la divisa elegida. */
  formatCompactCurrency: (n: number, currency: string) => string;
  /** Recibe un porcentaje en base 100 (7 → "7 %"). */
  formatPercent: (n: number) => string;
  /** Moneda en una divisa arbitraria (EUR/USD/GBP/JPY…), para las posiciones de la cartera. */
  formatCurrency: (n: number, currency: string) => string;
  /** Símbolo corto de una divisa ("€", "$", "£", "CHF"…) en el idioma activo. */
  currencySymbol: (currency: string) => string;
  /** Etiqueta compacta de una divisa para selectores: "€ EUR", "$ USD"… */
  currencyLabel: (currency: string) => string;
  /** Separador decimal del idioma ("," en es, "." en en). Para los campos de entrada editables. */
  decimalSeparator: string;
}

/** Construye un juego de formateadores para un idioma. Cachea internamente por divisa. */
function build(locale: Locale): Formatters {
  const l = INTL_LOCALE[locale];

  const eur = new Intl.NumberFormat(l, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const eurCents = new Intl.NumberFormat(l, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const num = new Intl.NumberFormat(l, { maximumFractionDigits: 0 });
  // Cantidades: hasta 6 decimales (la BD guarda `numeric(18,6)`), sin forzar decimales para
  // que un entero se muestre limpio. Redondear a entero falsearía 1368,8 → "1.369" y
  // ocultaría 0,5 BTC como "1".
  const quantity = new Intl.NumberFormat(l, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
  const multiplier = new Intl.NumberFormat(l, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const compact = new Intl.NumberFormat(l, { notation: "compact", maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(l, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // Cachés por divisa (dentro del closure del idioma: cada locale tiene las suyas). Sin esto,
  // una caché global por-divisa devolvería el formateador del primer idioma que la tocara.
  const currencyFormatters = new Map<string, Intl.NumberFormat>();
  const compactCurrencyFormatters = new Map<string, Intl.NumberFormat>();
  const currencySymbols = new Map<string, string>();

  const formatCurrency = (n: number, currency: string): string => {
    if (!Number.isFinite(n)) return NON_FINITE;
    let fmt = currencyFormatters.get(currency);
    if (!fmt) {
      // Los decimales los decide `Intl` por divisa (EUR/USD → 2, JPY → 0): forzar 2 rompería el yen.
      fmt = new Intl.NumberFormat(l, { style: "currency", currency });
      currencyFormatters.set(currency, fmt);
    }
    return fmt.format(n);
  };

  // Compacto CON divisa: se delega en `Intl` (style "currency" + notation "compact") en vez de
  // pegar el símbolo a mano, porque la posición del símbolo depende del idioma ("1,2 M €" en
  // es, "€1.2M" en en) y del propio código de divisa.
  const formatCompactCurrency = (n: number, currency: string): string => {
    if (!Number.isFinite(n)) return NON_FINITE;
    let fmt = compactCurrencyFormatters.get(currency);
    if (!fmt) {
      fmt = new Intl.NumberFormat(l, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      });
      compactCurrencyFormatters.set(currency, fmt);
    }
    return fmt.format(n);
  };

  const currencySymbol = (currency: string): string => {
    let symbol = currencySymbols.get(currency);
    if (symbol === undefined) {
      const parts = new Intl.NumberFormat(l, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      }).formatToParts(0);
      symbol = parts.find((p) => p.type === "currency")?.value ?? currency;
      currencySymbols.set(currency, symbol);
    }
    return symbol;
  };

  return {
    formatEUR: (n) => (Number.isFinite(n) ? eur.format(n) : NON_FINITE),
    formatEURCents: (n) => (Number.isFinite(n) ? eurCents.format(n) : NON_FINITE),
    formatNumber: (n) => (Number.isFinite(n) ? num.format(n) : NON_FINITE),
    formatQuantity: (n) => (Number.isFinite(n) ? quantity.format(n) : NON_FINITE),
    formatMultiplier: (n) => (Number.isFinite(n) ? multiplier.format(n) : NON_FINITE),
    formatCompactEUR: (n) => (Number.isFinite(n) ? `${compact.format(n)} €` : NON_FINITE),
    formatCompactCurrency,
    formatPercent: (n) => (Number.isFinite(n) ? pct.format(n / 100) : NON_FINITE),
    formatCurrency,
    currencySymbol,
    // El código ISO va SIEMPRE (los símbolos colisionan: $ → USD/CAD/AUD/HKD/SGD, ¥ → JPY/CNY).
    // Si la divisa no tiene símbolo propio (CHF), `currencySymbol` ya devuelve el código.
    currencyLabel: (currency) => {
      const symbol = currencySymbol(currency);
      return symbol === currency ? currency : `${symbol} ${currency}`;
    },
    // `num` redondea a entero, así que no sirve para sondear el separador: usamos uno limpio.
    decimalSeparator:
      new Intl.NumberFormat(l).formatToParts(1.1).find((p) => p.type === "decimal")?.value ?? ".",
  };
}

// Un juego de formateadores por idioma, construido una sola vez y reutilizado. Es seguro como
// singleton de módulo (contenido inmutable y determinista por locale; sin estado por request).
const cache = new Map<Locale, Formatters>();

/** Devuelve el juego de formateadores del idioma dado (memoizado). */
export function getFormatters(locale: Locale): Formatters {
  let f = cache.get(locale);
  if (!f) {
    f = build(locale);
    cache.set(locale, f);
  }
  return f;
}

/** Reformatea una fecha ISO "YYYY-MM-DD" a "DD/MM/YYYY" sin construir un Date (sin desfase de zona). */
export const formatIsoDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Fecha larga por idioma ("3 de septiembre de 2026" / "3 September 2026"). Un juego por
// locale, memoizado igual que los formateadores numéricos.
const longDateFormatters = new Map<Locale, Intl.DateTimeFormat>();

/**
 * Fecha ISO "YYYY-MM-DD" → fecha larga en el idioma dado.
 *
 * El día se ancla en UTC (`Date.UTC` + `timeZone: "UTC"`) por dos motivos: una fecha
 * "a secas" no tiene hora, y sin anclar, un navegador en una zona por detrás de UTC
 * mostraría el día anterior; además así el resultado es idéntico en servidor y en
 * cliente, que es lo que evita un desajuste de hidratación. Devuelve el ISO tal cual
 * si no es una fecha parseable, para no inventar un día.
 */
export const formatLongDate = (iso: string, locale: Locale): string => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;

  const timestamp = Date.UTC(y, m - 1, d);
  if (Number.isNaN(timestamp)) return iso;

  let fmt = longDateFormatters.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    longDateFormatters.set(locale, fmt);
  }
  return fmt.format(timestamp);
};
