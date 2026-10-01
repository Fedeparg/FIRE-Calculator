// Tipos compartidos de la importación de operaciones desde un bróker. Son GENÉRICOS a
// propósito: el parser de cada bróker produce `ImportedTrade` y todo lo que va después
// (plan de importación en la API, vista previa en la UI) no sabe de qué bróker viene.

/** Clase de activo, normalizada. `other` cubre lo vacío o lo que el bróker no clasifica. */
export type ImportedAssetClass = "fund" | "stock" | "derivative" | "other";

/**
 * Una compra o venta ya normalizada.
 *
 * Los importes viajan como `string` decimal (no `number`) para que ningún paso del camino
 * hasta `numeric(18,6)` pase por coma flotante; ya vienen redondeados a 6 decimales, la
 * escala de la columna. `fees` es siempre positivo (coste de la operación).
 */
export type ImportedTrade = {
  /** Id único de la operación en el bróker: es la clave de deduplicación al reimportar. */
  externalId: string;
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  kind: "buy" | "sell";
  /** Siempre positivo; el sentido lo da `kind`. */
  quantity: string;
  /** Precio unitario bruto, en la divisa de la operación. */
  price: string;
  fees: string;
  /** Fecha de la operación (YYYY-MM-DD) tal y como la declara el bróker. */
  tradedAt: string;
  /** Instante UTC, siempre con 6 decimales de segundo para que ordenar como texto sea fiable. */
  executedAt: string;
};

/** Por qué se descartó una fila. Cada código tiene su texto traducido en la UI. */
export type ImportSkipReason =
  | "dividend"
  | "interest"
  | "benefit"
  | "ipo_subscription"
  | "cash_movement"
  | "migration_pair"
  | "migration_unbalanced"
  | "bonus_issue_cancelled"
  | "crypto"
  | "unsupported_currency"
  | "duplicate_row"
  | "invalid_row"
  | "unknown_type";

/** Fila descartada. Solo lleva el tipo del bróker y la línea: nunca datos de la fila. */
export type ImportSkippedRow = {
  /** Línea (1-based) del fichero donde empieza el registro. */
  line: number;
  type: string;
  reason: ImportSkipReason;
};

/** Avisos que no bloquean la importación. */
export type ImportWarning =
  /** Operaciones con impuesto en su fila: NO se suma al coste (ver el parser de cada bróker). */
  | { code: "trade_tax_ignored"; count: number }
  /** Migración de custodia sin su pareja (entrada o salida): puede faltar historial. */
  | { code: "unbalanced_migration"; isin: string; line: number };

export type ImportParseResult = {
  /** Ordenadas por `executedAt` (y por línea ante empate). */
  trades: ImportedTrade[];
  skipped: ImportSkippedRow[];
  warnings: ImportWarning[];
};

// --- Contrato de la API de importación (lo producen la API y lo consume la UI) ---

/** Motivo por el que una posición NO se pudo importar. */
export type ImportFailureCode = "NEGATIVE_QUANTITY" | "OVERFLOW" | "UNEXPECTED";

/** Cuántas filas se descartaron por cada motivo. Solo recuentos: nunca datos de las filas. */
export type SkippedSummary = { reason: ImportSkipReason; count: number };

export type ImportPlanPosition = {
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  /** `create`: no existe aún en Trade Republic. `extend`: se añaden lotes a la existente. */
  action: "create" | "extend";
  /** Compras y ventas que se crearían (sin las ya importadas). */
  newBuys: number;
  newSells: number;
  /** Operaciones del fichero que ya están importadas (por `external_id`). */
  duplicates: number;
  /** Cantidad actual de la posición (0 si no existe). */
  currentQuantity: number;
  /** Cantidad tras importar. `null` si la secuencia sería inválida (ver `blockedBy`). */
  resultingQuantity: number | null;
  /**
   * Precio medio de coste tras importar, calculado con los precios de ejecución del fichero
   * (nunca con cierres de mercado). `null` si la posición queda cerrada o la secuencia es inválida.
   */
  resultingAvgPrice: number | null;
  /** Presente si esta posición NO se podrá importar. */
  blockedBy: ImportFailureCode | null;
  /** Derivado: se registra pero Sextante no sigue su precio ni lo suma a los totales. No bloquea. */
  isDerivative: boolean;
};

export type ImportPlan = {
  broker: string;
  positions: ImportPlanPosition[];
  totals: { newLots: number; duplicates: number };
  skipped: SkippedSummary[];
  warnings: ImportWarning[];
};

export type ImportResultPosition = {
  isin: string;
  name: string;
  status: "created" | "extended" | "unchanged" | "failed";
  lotsCreated: number;
  duplicates: number;
  /** Cantidad final de la posición; `null` si falló. */
  quantity: number | null;
  failure: ImportFailureCode | null;
};

export type ImportResult = {
  broker: string;
  positions: ImportResultPosition[];
  totals: { lotsCreated: number; duplicates: number; failedPositions: number };
  skipped: SkippedSummary[];
  warnings: ImportWarning[];
};
