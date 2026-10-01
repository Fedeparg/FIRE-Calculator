import type { CalculatorMeta } from "@/core/types";

// Catálogo completo de calculadoras del producto.
// Cada entrada es una calculadora implementada y navegable en /calculadoras/<slug>.

export const CALCULATORS: CalculatorMeta[] = [
  {
    slug: "interes-compuesto",
    name: { es: "Interés compuesto", en: "Compound interest" },
    category: "inversion",
    description: {
      es: "Proyecta el crecimiento de tus inversiones con aportaciones periódicas.",
      en: "Project your investment growth with regular contributions.",
    },
    keywords: ["interes", "compuesto", "inversion", "fondos", "indexados", "compound", "investing", "snowball"],
  },
  {
    slug: "independencia-financiera",
    name: { es: "Independencia financiera (FIRE)", en: "Financial independence (FIRE)" },
    category: "fire",
    description: {
      es: "Calcula tu número FIRE y en cuántos años puedes vivir de tus rentas.",
      en: "Work out your FIRE number and how many years until you can live off your assets.",
    },
    keywords: ["fire", "independencia", "libertad", "financiera", "regla 4", "25x", "retire early", "freedom"],
  },
  {
    slug: "simulador-montecarlo",
    name: { es: "Simulador FIRE Monte Carlo", en: "FIRE Monte Carlo simulator" },
    category: "fire",
    description: {
      es: "Probabilidad de alcanzar FIRE y de que tu dinero dure toda la jubilación, en miles de escenarios.",
      en: "Probability of reaching FIRE and of your money lasting through retirement, across thousands of scenarios.",
    },
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
    name: { es: "Hipoteca a tipo fijo", en: "Fixed-rate mortgage" },
    category: "hipoteca",
    description: {
      es: "Cuota mensual, intereses totales y cuadro de amortización.",
      en: "Monthly payment, total interest and amortization schedule.",
    },
    keywords: ["hipoteca", "fija", "cuota", "amortizacion", "mortgage", "loan", "payment"],
  },

  {
    slug: "interes-simple",
    name: { es: "Interés simple", en: "Simple interest" },
    category: "inversion",
    description: { es: "Cálculo básico de interés simple.", en: "Basic simple-interest calculation." },
    keywords: ["interes", "simple", "interest"],
  },
  {
    slug: "promediar-acciones",
    name: { es: "Promediar acciones (DCA)", en: "Average down (DCA)" },
    category: "inversion",
    description: { es: "Precio medio ponderado de tus compras.", en: "Weighted average price of your purchases." },
    keywords: ["promediar", "acciones", "dca", "average"],
  },
  {
    slug: "dividendos",
    name: { es: "Dividendos de acciones", en: "Stock dividends" },
    category: "inversion",
    description: { es: "Ingresos por dividendos y retención.", en: "Dividend income and withholding." },
    keywords: ["dividendos", "dividends", "rentas"],
  },
  {
    slug: "roi",
    name: { es: "ROI", en: "ROI" },
    category: "inversion",
    description: { es: "Retorno de la inversión.", en: "Return on investment." },
    keywords: ["roi", "retorno", "return"],
  },
  {
    slug: "staking",
    name: { es: "Intereses de staking (cripto)", en: "Staking interest (crypto)" },
    category: "inversion",
    description: { es: "Rendimiento de staking en criptoactivos.", en: "Yield from crypto staking." },
    keywords: ["staking", "cripto", "crypto", "apy"],
  },

  {
    slug: "ahorro-jubilacion",
    name: { es: "Ahorro para la jubilación", en: "Retirement savings" },
    category: "fire",
    description: { es: "Cuánto necesitas ahorrar para tu jubilación.", en: "How much to save for retirement." },
    keywords: ["jubilacion", "ahorro", "retirement"],
  },
  {
    slug: "presupuesto-mensual",
    name: { es: "Presupuesto mensual", en: "Monthly budget" },
    category: "fire",
    description: {
      es: "Organiza ingresos y gastos (regla 50/30/20).",
      en: "Organize income and expenses (50/30/20 rule).",
    },
    keywords: ["presupuesto", "budget", "50/30/20"],
  },

  {
    slug: "que-hipoteca-me-puedo-permitir",
    name: { es: "¿Qué hipoteca me puedo permitir?", en: "How much mortgage can I afford?" },
    category: "hipoteca",
    description: { es: "Importe máximo según tus ingresos.", en: "Maximum amount based on your income." },
    keywords: ["hipoteca", "permitir", "afford", "esfuerzo"],
  },
  {
    slug: "hipoteca-vs-alquiler",
    name: { es: "Hipoteca vs alquiler", en: "Buy vs rent" },
    category: "hipoteca",
    description: { es: "Comprar o alquilar: comparativa.", en: "Buying or renting: a comparison." },
    keywords: ["hipoteca", "alquiler", "buy", "rent"],
  },
  {
    slug: "amortizacion-anticipada",
    name: { es: "Amortización anticipada", en: "Early repayment" },
    category: "hipoteca",
    description: { es: "Reducir cuota o plazo amortizando antes.", en: "Reduce payment or term by repaying early." },
    keywords: ["amortizacion", "anticipada", "early", "repayment"],
  },
  {
    slug: "rentabilidad-alquiler",
    name: { es: "Rentabilidad de alquiler", en: "Rental yield" },
    category: "hipoteca",
    description: { es: "Rentabilidad bruta y neta de un inmueble.", en: "Gross and net yield of a property." },
    keywords: ["alquiler", "rentabilidad", "rental", "yield"],
  },
  {
    slug: "rentabilidad-alquiler-vacacional",
    name: { es: "Rentabilidad alquiler vacacional", en: "Holiday rental yield" },
    category: "hipoteca",
    description: { es: "Rentabilidad de un alquiler turístico.", en: "Yield of a holiday let." },
    keywords: ["alquiler", "vacacional", "holiday", "turistico"],
  },

  {
    slug: "deposito-plazo-fijo",
    name: { es: "Depósito a plazo fijo", en: "Fixed-term deposit" },
    category: "ahorro",
    description: { es: "Intereses de un depósito bancario.", en: "Interest on a bank deposit." },
    keywords: ["deposito", "plazo fijo", "deposit", "tae"],
  },
  {
    slug: "cuenta-remunerada",
    name: { es: "Cuenta remunerada", en: "High-yield account" },
    category: "ahorro",
    description: { es: "Rentabilidad de una cuenta remunerada.", en: "Return of a high-yield savings account." },
    keywords: ["cuenta", "remunerada", "savings", "tae"],
  },

  {
    slug: "impuesto-donaciones",
    name: { es: "Impuesto de donaciones", en: "Gift tax" },
    category: "fiscalidad",
    description: { es: "Estimación por CCAA y parentesco.", en: "Estimate by region and kinship." },
    keywords: ["donaciones", "gift", "impuesto", "tax"],
  },
  {
    slug: "impuesto-patrimonio",
    name: { es: "Impuesto sobre el patrimonio", en: "Wealth tax" },
    category: "fiscalidad",
    description: { es: "Estimación según patrimonio y CCAA.", en: "Estimate by wealth and region." },
    keywords: ["patrimonio", "wealth", "tax"],
  },
  {
    slug: "desgravacion-plan-pensiones",
    name: { es: "Desgravación plan de pensiones", en: "Pension plan tax relief" },
    category: "fiscalidad",
    description: { es: "Ahorro fiscal por aportar a un plan.", en: "Tax savings from pension contributions." },
    keywords: ["plan", "pensiones", "pension", "irpf"],
  },
  {
    slug: "salario-bruto-neto",
    name: { es: "Salario bruto a neto", en: "Gross to net salary" },
    category: "fiscalidad",
    description: { es: "De salario bruto a neto mensual.", en: "From gross to net monthly salary." },
    keywords: ["salario", "bruto", "neto", "salary", "net"],
  },
  {
    slug: "irpf-nomina",
    name: { es: "IRPF nómina", en: "Payroll income tax" },
    category: "fiscalidad",
    description: { es: "Retención de IRPF en nómina.", en: "Income-tax withholding on payroll." },
    keywords: ["irpf", "nomina", "payroll", "tax"],
  },
  {
    slug: "irpf-autonomos",
    name: { es: "IRPF autónomos", en: "Self-employed income tax" },
    category: "fiscalidad",
    description: { es: "IRPF para autónomos.", en: "Income tax for the self-employed." },
    keywords: ["irpf", "autonomos", "self-employed"],
  },

  {
    slug: "intereses-tarjeta-credito",
    name: { es: "Intereses de tarjeta de crédito", en: "Credit card interest" },
    category: "deuda",
    description: { es: "Coste de la deuda revolving.", en: "Cost of revolving debt." },
    keywords: ["tarjeta", "credito", "credit card", "revolving"],
  },

  {
    slug: "inflacion",
    name: { es: "Inflación (IPC)", en: "Inflation (CPI)" },
    category: "herramientas",
    description: { es: "Poder adquisitivo a lo largo del tiempo.", en: "Purchasing power over time." },
    keywords: ["inflacion", "ipc", "inflation", "cpi"],
  },
  {
    slug: "salud-financiera",
    name: { es: "Test de salud financiera", en: "Financial health test" },
    category: "herramientas",
    description: { es: "Cuestionario sobre tus finanzas.", en: "A quiz about your finances." },
    keywords: ["test", "salud", "health", "quiz"],
  },
];
