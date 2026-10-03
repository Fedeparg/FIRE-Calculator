import { describe, expect, it } from "vitest";
import { formatLongDate, formatRelativeTime, getFormatters } from "./format";

const es = getFormatters("es");
const en = getFormatters("en");

describe("formatCurrency", () => {
  it("usa separadores es-ES (coma decimal) y dos decimales", () => {
    // El símbolo va separado por un espacio fino que varía según el ICU; lo estable
    // es la coma decimal, los dos decimales y el símbolo de euro.
    expect(es.formatCurrency(1234.5, "EUR")).toMatch(/^1234,50\s?€$/u);
    expect(es.formatCurrency(5, "EUR")).toMatch(/^5,00\s?€$/u);
  });

  it("aplica la agrupación de miles según el idioma", () => {
    // Regla española (RAE/CLDR): las cifras de 4 dígitos NO llevan separador de miles,
    // pero sí a partir de 5 (10.000). Es el núcleo de la localización del formato.
    expect(es.formatCurrency(2000, "EUR")).toContain("2000,00");
    expect(es.formatCurrency(12345, "EUR")).toContain("12.345,00");
    // Inglés (en-GB): agrupa SIEMPRE desde 4 dígitos, coma para miles y punto decimal.
    expect(en.formatCurrency(2000, "EUR")).toContain("2,000.00");
    expect(en.formatCurrency(12345, "EUR")).toContain("12,345.00");
  });

  it("formatea el importe en la divisa indicada", () => {
    // El símbolo exacto depende del ICU; lo estable es el importe con su separador decimal.
    expect(es.formatCurrency(1000, "USD")).toContain("1000,00");
    expect(es.formatCurrency(99.9, "GBP")).toContain("99,90");
    expect(en.formatCurrency(99.9, "GBP")).toContain("99.90");
  });

  it("devuelve el marcador '—' para valores no finitos en ambos idiomas", () => {
    expect(es.formatCurrency(Number.NaN, "EUR")).toBe("—");
    expect(en.formatCurrency(Number.POSITIVE_INFINITY, "USD")).toBe("—");
  });

  it("degrada a importe + código ISO con una divisa que Intl no conoce, sin lanzar", () => {
    expect(es.formatCurrency(12.5, "EURO")).toBe("12,50 EURO");
    expect(es.formatCompactCurrency(1_200_000, "EURO")).toMatch(/^1,2\sM EURO$/u);
    expect(es.currencySymbol("EURO")).toBe("EURO");
  });
});

describe("formatEUR", () => {
  it("no escribe '-0 €' al redondear un negativo pequeño", () => {
    expect(es.formatEUR(-0.4)).toMatch(/^0\s?€$/u);
    expect(es.formatEUR(-0.6)).toMatch(/^-1\s?€$/u);
  });
});

describe("formatCompactEUR", () => {
  it("coloca el símbolo según el idioma", () => {
    expect(es.formatCompactEUR(1_200_000)).toMatch(/^1,2\sM\s€$/u);
    expect(en.formatCompactEUR(1_200_000)).toMatch(/^€1\.2[mM]$/u);
  });
});

describe("formatQuantity", () => {
  it("conserva los decimales de la cantidad (no redondea a entero)", () => {
    // El caso real que motivó el fix: 1368,8 participaciones no debe redondear a 1369.
    expect(es.formatQuantity(1368.8)).toBe("1368,8");
    // Fracciones < 1 (p. ej. cripto) no deben colapsar a "0".
    expect(es.formatQuantity(0.5)).toBe("0,5");
    expect(es.formatQuantity(0.00123456)).toBe("0,001235");
  });

  it("muestra un entero sin decimales superfluos", () => {
    expect(es.formatQuantity(1369)).toBe("1369");
    expect(es.formatQuantity(0)).toBe("0");
  });

  it("limita a 6 decimales (la precisión con la que se almacena)", () => {
    // numeric(18,6): más allá de 6 decimales se redondea, no se inventa precisión.
    expect(es.formatQuantity(1.2345678)).toBe("1,234568");
  });

  it("devuelve el marcador '—' para valores no finitos", () => {
    expect(es.formatQuantity(Number.NaN)).toBe("—");
    expect(es.formatQuantity(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("recibe base 100 y usa el separador decimal del idioma", () => {
    expect(es.formatPercent(7)).toMatch(/^7\s?%$/u);
    expect(es.formatPercent(3.25)).toMatch(/^3,25\s?%$/u);
    expect(en.formatPercent(3.25)).toMatch(/^3\.25%$/u);
  });

  // Regresión: en la columna de rentabilidad de la cartera, un 39,40 % se escribía
  // "39,4 %" entre valores de dos decimales, y se leía como si tuviera menos precisión.
  it("con minDecimals mantiene los decimales que acaban en cero", () => {
    expect(es.formatPercent(39.4, { minDecimals: 2 })).toMatch(/^39,40\s?%$/u);
    expect(es.formatPercent(16, { minDecimals: 2 })).toMatch(/^16,00\s?%$/u);
    expect(en.formatPercent(39.4, { minDecimals: 2 })).toMatch(/^39\.40%$/u);
  });

  it("sin minDecimals sigue omitiendo los decimales que no aportan", () => {
    expect(es.formatPercent(39.4)).toMatch(/^39,4\s?%$/u);
    expect(es.formatPercent(16)).toMatch(/^16\s?%$/u);
  });

  it("no rompe con valores no finitos", () => {
    expect(es.formatPercent(Number.NaN, { minDecimals: 2 })).toBe("—");
    expect(es.formatPercent(Number.POSITIVE_INFINITY, { minDecimals: 2 })).toBe("—");
  });
});

describe("decimalSeparator", () => {
  it("es la coma en castellano y el punto en inglés", () => {
    expect(es.decimalSeparator).toBe(",");
    expect(en.decimalSeparator).toBe(".");
  });
});

describe("formatLongDate", () => {
  it("escribe la fecha larga en el idioma pedido", () => {
    expect(formatLongDate("2026-09-03", "es")).toBe("3 de septiembre de 2026");
    expect(formatLongDate("2026-09-03", "en")).toBe("3 September 2026");
  });

  it("no se desplaza un día por la zona horaria", () => {
    // Ancla el día en UTC: en una zona por detrás de UTC (p. ej. America/New_York),
    // `new Date("2026-01-01")` formateado en local daría el 31 de diciembre.
    const original = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(formatLongDate("2026-01-01", "es")).toBe("1 de enero de 2026");
    } finally {
      process.env.TZ = original;
    }
  });

  it("devuelve la cadena tal cual si no es una fecha parseable", () => {
    expect(formatLongDate("no es una fecha", "es")).toBe("no es una fecha");
    expect(formatLongDate("", "es")).toBe("");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("menos de un minuto es «ahora»", () => {
    expect(formatRelativeTime(ago(20), now, "es")).toBe("ahora");
    expect(formatRelativeTime(ago(20), now, "en")).toBe("now");
  });

  it("elige la unidad por el tamaño y redondea hacia abajo", () => {
    expect(formatRelativeTime(ago(5 * 60 + 59), now, "es")).toBe("hace 5 minutos");
    expect(formatRelativeTime(ago(58 * 60), now, "en")).toBe("58 minutes ago");
    expect(formatRelativeTime(ago(2 * 3600 + 10), now, "es")).toBe("hace 2 horas");
    expect(formatRelativeTime(ago(26 * 3600), now, "es")).toBe("ayer");
    expect(formatRelativeTime(ago(3 * 86_400), now, "en")).toBe("3 days ago");
  });

  it("un instante futuro cuenta como «ahora» y uno ilegible como «—»", () => {
    expect(formatRelativeTime(ago(-3600), now, "es")).toBe("ahora");
    expect(formatRelativeTime("no es una fecha", now, "es")).toBe("—");
    expect(formatRelativeTime(ago(10), Number.NaN, "es")).toBe("—");
  });
});

describe("formatSignedCurrency / formatSignedPercent", () => {
  const es = getFormatters("es");
  const en = getFormatters("en");

  it("pone + en las ganancias y deja el resto como formatCurrency", () => {
    expect(es.formatSignedCurrency(1234.5, "EUR")).toBe(`+${es.formatCurrency(1234.5, "EUR")}`);
    expect(en.formatSignedCurrency(12, "USD")).toBe(`+${en.formatCurrency(12, "USD")}`);
    expect(es.formatSignedCurrency(-3, "EUR")).toBe(es.formatCurrency(-3, "EUR"));
  });

  it("el cero, el -0 y lo que redondea a cero van sin signo", () => {
    const zero = es.formatCurrency(0, "EUR");
    expect(es.formatSignedCurrency(0, "EUR")).toBe(zero);
    expect(es.formatSignedCurrency(-0, "EUR")).toBe(zero);
    expect(es.formatSignedCurrency(0.001, "EUR")).toBe(zero);
    expect(es.formatSignedCurrency(-0.001, "EUR")).toBe(zero);
  });

  it("no rompe con una divisa desconocida ni con no finitos", () => {
    expect(es.formatSignedCurrency(5, "XX1")).toBe(`+${es.formatCurrency(5, "XX1")}`);
    expect(es.formatSignedCurrency(Number.NaN, "EUR")).toBe("—");
  });

  it("porcentajes con signo y la misma regla del cero", () => {
    expect(es.formatSignedPercent(5.2)).toBe(`+${es.formatPercent(5.2)}`);
    expect(es.formatSignedPercent(-5.2, { minDecimals: 2 })).toBe(es.formatPercent(-5.2, { minDecimals: 2 }));
    expect(es.formatSignedPercent(-0)).toBe(es.formatPercent(0));
    expect(es.formatSignedPercent(Infinity)).toBe("—");
  });
});
