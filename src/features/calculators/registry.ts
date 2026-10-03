import type { CalculatorMeta, CategoryId } from "@/features/calculators/types";

// Catálogo completo de calculadoras del producto.
// Cada entrada es una calculadora implementada y navegable en /calculadoras/<slug>. El orden es el
// del selector y el sitemap. El nombre y la descripción viven en i18n (`catalog.<slug>`), como el
// resto de textos visibles; aquí solo lo que no se traduce.
//
// `as const` conserva cada slug como literal, de modo que `CalculatorSlug` es la unión exacta de
// los slugs y un mapa `Record<CalculatorSlug, …>` falla en compilación si le falta uno.

export const CALCULATORS = [
  {
    slug: "interes-compuesto",
    category: "inversion",
    keywords: ["interes", "compuesto", "inversion", "fondos", "indexados", "compound", "investing", "snowball"],
  },
  {
    slug: "independencia-financiera",
    category: "fire",
    keywords: ["fire", "independencia", "libertad", "financiera", "regla 4", "25x", "retire early", "freedom"],
  },
  {
    slug: "simulador-montecarlo",
    category: "fire",
    keywords: [
      "monte carlo",
      "montecarlo",
      "simulacion",
      "probabilidad",
      "fire",
      "jubilacion",
      "volatilidad",
      "trinity",
      "simulation",
      "probability",
      "retirement",
    ],
  },
  {
    slug: "hipoteca-fija",
    category: "hipoteca",
    keywords: ["hipoteca", "fija", "cuota", "amortizacion", "mortgage", "loan", "payment"],
  },
  {
    slug: "interes-simple",
    category: "inversion",
    keywords: ["interes", "simple", "interest"],
  },
  {
    slug: "promediar-acciones",
    category: "inversion",
    keywords: ["promediar", "acciones", "dca", "average"],
  },
  {
    slug: "dividendos",
    category: "inversion",
    keywords: ["dividendos", "dividends", "rentas"],
  },
  {
    slug: "roi",
    category: "inversion",
    keywords: ["roi", "retorno", "return"],
  },
  {
    slug: "staking",
    category: "inversion",
    keywords: ["staking", "cripto", "crypto", "apy"],
  },
  {
    slug: "ahorro-jubilacion",
    category: "fire",
    keywords: ["jubilacion", "ahorro", "retirement"],
  },
  {
    slug: "presupuesto-mensual",
    category: "fire",
    keywords: ["presupuesto", "budget", "50/30/20"],
  },
  {
    slug: "que-hipoteca-me-puedo-permitir",
    category: "hipoteca",
    keywords: ["hipoteca", "permitir", "afford", "esfuerzo"],
  },
  {
    slug: "hipoteca-vs-alquiler",
    category: "hipoteca",
    keywords: ["hipoteca", "alquiler", "buy", "rent"],
  },
  {
    slug: "amortizacion-anticipada",
    category: "hipoteca",
    keywords: ["amortizacion", "anticipada", "early", "repayment"],
  },
  {
    slug: "rentabilidad-alquiler",
    category: "hipoteca",
    keywords: ["alquiler", "rentabilidad", "rental", "yield"],
  },
  {
    slug: "rentabilidad-alquiler-vacacional",
    category: "hipoteca",
    keywords: ["alquiler", "vacacional", "holiday", "turistico"],
  },
  {
    slug: "deposito-plazo-fijo",
    category: "ahorro",
    keywords: ["deposito", "plazo fijo", "deposit", "tae"],
  },
  {
    slug: "cuenta-remunerada",
    category: "ahorro",
    keywords: ["cuenta", "remunerada", "savings", "tae"],
  },
  {
    slug: "impuesto-donaciones",
    category: "fiscalidad",
    keywords: ["donaciones", "gift", "impuesto", "tax"],
  },
  {
    slug: "impuesto-patrimonio",
    category: "fiscalidad",
    keywords: ["patrimonio", "wealth", "tax"],
  },
  {
    slug: "desgravacion-plan-pensiones",
    category: "fiscalidad",
    keywords: ["plan", "pensiones", "pension", "irpf"],
  },
  {
    slug: "salario-bruto-neto",
    category: "fiscalidad",
    keywords: ["salario", "bruto", "neto", "salary", "net"],
  },
  {
    slug: "irpf-nomina",
    category: "fiscalidad",
    keywords: ["irpf", "nomina", "payroll", "tax"],
  },
  {
    slug: "irpf-autonomos",
    category: "fiscalidad",
    keywords: ["irpf", "autonomos", "self-employed"],
  },
  {
    slug: "intereses-tarjeta-credito",
    category: "deuda",
    keywords: ["tarjeta", "credito", "credit card", "revolving"],
  },
  {
    slug: "inflacion",
    category: "herramientas",
    keywords: ["inflacion", "ipc", "inflation", "cpi"],
  },
  {
    slug: "salud-financiera",
    category: "herramientas",
    keywords: ["test", "salud", "health", "quiz"],
  },
] as const satisfies readonly CalculatorMeta[];

/** Slug de una calculadora del catálogo. */
export type CalculatorSlug = (typeof CALCULATORS)[number]["slug"];

const SLUGS: ReadonlySet<string> = new Set(CALCULATORS.map((c) => c.slug));

/** Estrecha un slug que llega de la URL (o de un fichero) al tipo del catálogo. */
export function isCalculatorSlug(slug: string): slug is CalculatorSlug {
  return SLUGS.has(slug);
}

/** Categorías con al menos una calculadora, en el orden en que aparecen en el catálogo. */
export function getUsedCategories(): CategoryId[] {
  return [...new Set(CALCULATORS.map((c) => c.category))];
}
