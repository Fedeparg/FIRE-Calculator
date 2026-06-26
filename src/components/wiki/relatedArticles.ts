/**
 * Mapeo declarativo y central: calculadora → artículos de la wiki relacionados.
 *
 * Es la ÚNICA fuente de verdad para los chips de "sigue aprendiendo" que
 * aparecen bajo cada calculadora. Para enlazar una calculadora nueva con la
 * wiki, añade UNA línea aquí:
 *
 *   "slug-de-la-calculadora": ["slug-articulo-1", "slug-articulo-2"],
 *
 * - La clave es el `slug` de la calculadora (ver `src/core/registry.ts`).
 * - El valor es la lista de slugs de artículos (ficheros
 *   `content/wiki/<slug>.<locale>.md`), en el orden en que se mostrarán
 *   (el primero es el más relevante).
 * - Si una calculadora no aparece aquí (o su lista está vacía), no se
 *   renderiza ningún chip: degradación elegante, sin tocar lógica.
 */
export const RELATED_ARTICLES: Record<string, readonly string[]> = {
  // Inversión e interés compuesto
  "interes-compuesto": ["interes-compuesto", "inflacion-y-poder-adquisitivo", "interes-simple", "conceptos-basicos-inversion"],
  "interes-simple": ["interes-simple", "interes-compuesto", "conceptos-basicos-inversion"],
  "promediar-acciones": ["dollar-cost-averaging", "conceptos-basicos-inversion", "diversificacion-y-riesgo"],
  "dividendos": ["dividendos", "fiscalidad-avanzada-fondos", "fiscalidad-del-ahorro", "conceptos-basicos-inversion"],
  "roi": ["roi-rentabilidad-cagr", "asignacion-activos-glide-path", "conceptos-basicos-inversion"],
  "staking": ["staking-y-cripto", "fiscalidad-del-ahorro", "diversificacion-y-riesgo"],

  // FIRE y planificación
  "independencia-financiera": ["regla-del-4", "riesgo-secuencia-retornos", "estrategias-retirada-dinamicas", "coast-barista-fire", "ahorro-para-la-jubilacion"],
  "ahorro-jubilacion": ["ahorro-para-la-jubilacion", "coast-barista-fire", "asignacion-activos-glide-path", "planes-de-pensiones"],
  "presupuesto-mensual": ["presupuesto-50-30-20", "ahorro-para-la-jubilacion"],

  // Hipoteca y vivienda
  "hipoteca-fija": ["hipoteca-sistema-frances", "amortizacion-anticipada", "tae-vs-tin"],
  "que-hipoteca-me-puedo-permitir": ["hipoteca-sistema-frances", "comprar-vs-alquilar", "tae-vs-tin"],
  "hipoteca-vs-alquiler": ["comprar-vs-alquilar", "rentabilidad-inmobiliaria", "socimi-reits-crowdfunding", "hipoteca-sistema-frances"],
  "amortizacion-anticipada": ["amortizacion-anticipada", "hipoteca-sistema-frances"],
  "rentabilidad-alquiler": ["rentabilidad-inmobiliaria", "socimi-reits-crowdfunding", "comprar-vs-alquilar"],
  "rentabilidad-alquiler-vacacional": ["rentabilidad-inmobiliaria", "socimi-reits-crowdfunding", "comprar-vs-alquilar"],

  // Ahorro y depósitos
  "deposito-plazo-fijo": ["depositos-y-cuentas-remuneradas", "escalera-de-bonos", "tae-vs-tin", "fiscalidad-del-ahorro"],
  "cuenta-remunerada": ["depositos-y-cuentas-remuneradas", "escalera-de-bonos", "tae-vs-tin", "fiscalidad-del-ahorro"],

  // Fiscalidad
  "desgravacion-plan-pensiones": ["planes-de-pensiones", "rescate-plan-pensiones", "fiscalidad-del-ahorro", "ahorro-para-la-jubilacion"],
  "salario-bruto-neto": ["fiscalidad-del-ahorro", "presupuesto-50-30-20"],
  "irpf-nomina": ["fiscalidad-del-ahorro", "presupuesto-50-30-20"],
  "irpf-autonomos": ["fiscalidad-del-ahorro", "presupuesto-50-30-20"],
  "impuesto-patrimonio": ["fiscalidad-del-ahorro", "socimi-reits-crowdfunding", "diversificacion-y-riesgo"],
  "impuesto-donaciones": ["fiscalidad-del-ahorro"],

  // Deuda
  "intereses-tarjeta-credito": ["tarjetas-revolving"],

  // Herramientas
  "inflacion": ["inflacion-y-poder-adquisitivo", "conceptos-basicos-inversion"],
  "salud-financiera": ["presupuesto-50-30-20", "asignacion-activos-glide-path", "diversificacion-y-riesgo", "conceptos-basicos-inversion"],
};

/** Slugs de artículos relacionados con una calculadora (vacío si no hay). */
export function getRelatedArticleSlugs(calcSlug: string): readonly string[] {
  return RELATED_ARTICLES[calcSlug] ?? [];
}
