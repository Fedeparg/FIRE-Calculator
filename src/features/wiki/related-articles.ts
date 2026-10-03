import { CALCULATORS, type CalculatorSlug } from "@/features/calculators/registry";

/**
 * Central, declarative mapping: calculator → related wiki articles.
 *
 * It is the ONLY source of truth for the "sigue aprendiendo" (keep learning) chips shown
 * under each calculator. To link a new calculator to the wiki, add ONE line here:
 *
 *   "calculator-slug": ["article-slug-1", "article-slug-2"],
 *
 * - The key is the calculator's `slug` (see `src/features/calculators/registry.ts`).
 * - The value is the list of article slugs (files `content/wiki/<slug>.<locale>.md`), in
 *   display order (the first is the most relevant).
 * - If a calculator is missing here (or its list is empty), no chip is rendered: graceful
 *   degradation, with no logic changes.
 */
const RELATED_ARTICLES: Partial<Record<CalculatorSlug, readonly string[]>> = {
  // Investing and compound interest
  "interes-compuesto": [
    "interes-compuesto",
    "inflacion-y-poder-adquisitivo",
    "interes-simple",
    "conceptos-basicos-inversion",
  ],
  "interes-simple": ["interes-simple", "interes-compuesto", "conceptos-basicos-inversion"],
  "promediar-acciones": ["dollar-cost-averaging", "conceptos-basicos-inversion", "diversificacion-y-riesgo"],
  dividendos: ["dividendos", "fiscalidad-avanzada-fondos", "fiscalidad-del-ahorro", "conceptos-basicos-inversion"],
  roi: ["roi-rentabilidad-cagr", "asignacion-activos-glide-path", "conceptos-basicos-inversion"],
  staking: ["staking-y-cripto", "fiscalidad-del-ahorro", "diversificacion-y-riesgo"],

  // FIRE and planning
  "independencia-financiera": [
    "regla-del-4",
    "riesgo-secuencia-retornos",
    "estrategias-retirada-dinamicas",
    "coast-barista-fire",
    "ahorro-para-la-jubilacion",
  ],
  "ahorro-jubilacion": [
    "ahorro-para-la-jubilacion",
    "coast-barista-fire",
    "asignacion-activos-glide-path",
    "planes-de-pensiones",
  ],
  "presupuesto-mensual": ["presupuesto-50-30-20", "ahorro-para-la-jubilacion"],

  // Mortgage and housing
  "hipoteca-fija": ["hipoteca-sistema-frances", "amortizacion-anticipada", "tae-vs-tin"],
  "que-hipoteca-me-puedo-permitir": ["hipoteca-sistema-frances", "comprar-vs-alquilar", "tae-vs-tin"],
  "hipoteca-vs-alquiler": [
    "comprar-vs-alquilar",
    "rentabilidad-inmobiliaria",
    "socimi-reits-crowdfunding",
    "hipoteca-sistema-frances",
  ],
  "amortizacion-anticipada": ["amortizacion-anticipada", "hipoteca-sistema-frances"],
  "rentabilidad-alquiler": ["rentabilidad-inmobiliaria", "socimi-reits-crowdfunding", "comprar-vs-alquilar"],
  "rentabilidad-alquiler-vacacional": ["rentabilidad-inmobiliaria", "socimi-reits-crowdfunding", "comprar-vs-alquilar"],

  // Savings and deposits
  "deposito-plazo-fijo": [
    "depositos-y-cuentas-remuneradas",
    "escalera-de-bonos",
    "tae-vs-tin",
    "fiscalidad-del-ahorro",
  ],
  "cuenta-remunerada": ["depositos-y-cuentas-remuneradas", "escalera-de-bonos", "tae-vs-tin", "fiscalidad-del-ahorro"],

  // Taxation
  "desgravacion-plan-pensiones": [
    "planes-de-pensiones",
    "rescate-plan-pensiones",
    "fiscalidad-del-ahorro",
    "ahorro-para-la-jubilacion",
  ],
  "salario-bruto-neto": ["fiscalidad-del-ahorro", "presupuesto-50-30-20"],
  "irpf-nomina": ["fiscalidad-del-ahorro", "presupuesto-50-30-20"],
  "irpf-autonomos": ["fiscalidad-del-ahorro", "presupuesto-50-30-20"],
  "impuesto-patrimonio": ["fiscalidad-del-ahorro", "socimi-reits-crowdfunding", "diversificacion-y-riesgo"],
  "impuesto-donaciones": ["fiscalidad-del-ahorro"],

  // Debt
  "intereses-tarjeta-credito": ["tarjetas-revolving"],

  // Tools
  inflacion: ["inflacion-y-poder-adquisitivo", "conceptos-basicos-inversion"],
  "salud-financiera": [
    "presupuesto-50-30-20",
    "asignacion-activos-glide-path",
    "diversificacion-y-riesgo",
    "conceptos-basicos-inversion",
  ],
};

/** Slugs of the articles related to a calculator (empty if none). */
export function getRelatedArticleSlugs(calcSlug: CalculatorSlug): readonly string[] {
  return RELATED_ARTICLES[calcSlug] ?? [];
}

/**
 * Inverse of `RELATED_ARTICLES`: given the calculator → articles relations, returns the
 * calculators that link to an article. It powers bidirectional internal linking (from the wiki
 * article to its calculators), reusing the same central mapping as the single source of truth.
 */
export function getRelatedCalculatorSlugs(articleSlug: string): CalculatorSlug[] {
  return CALCULATORS.map((c) => c.slug).filter((slug) => RELATED_ARTICLES[slug]?.includes(articleSlug));
}
