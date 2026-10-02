// Tipos compartidos de la importación de operaciones. Genéricos a propósito: cada parser de bróker
// produce `ImportedTrade` y el resto (plan en la API, vista previa en la UI) no sabe de qué bróker viene.

/** Clase de activo normalizada; `other` cubre lo vacío o lo no clasificado. */
export type ImportedAssetClass = "fund" | "stock" | "derivative" | "other";

/**
 * Compra o venta normalizada. Los importes van como `string` decimal para no pasar por coma flotante
 * hasta `numeric(18,6)`, ya redondeados a 6 decimales. `fees` es siempre positivo.
 */
export type ImportedTrade = {
  /** Id de la operación en el bróker; clave de deduplicación al reimportar. */
  externalId: string;
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  kind: "buy" | "sell";
  /** Siempre positivo; el sentido lo da `kind`. */
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
  /** Instante UTC con 6 decimales de segundo, para que ordenar como texto sea fiable. */
  executedAt: string;
};

/**
 * Cobro normalizado (interés, recompensa o dividendo). Importes en `string` decimal, en euros, ya
 * redondeados a 6 decimales. `reportedToAeat`: el bróker ya lo comunicó a la AEAT (sucursal
 * española), así que puede estar en el borrador.
 */
export type ImportedIncome = {
  externalId: string;
  kind: "dividend" | "interest" | "benefit";
  paidAt: string;
  isin: string | null;
  name: string | null;
  /** País de la fuente (ISO 3166-1 alfa-2). */
  country: string | null;
  currency: "EUR";
  /** Íntegro; negativo en una anulación. */
  gross: string;
  /** `null` si no se puede saber. */
  withholdingOrigin: string | null;
  withholdingSpain: string;
  reportedToAeat: boolean;
};

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

/** Fila descartada: solo lleva el tipo del bróker y la línea, nunca datos de la fila. */
export type ImportSkippedRow = {
  line: number;
  type: string;
  reason: ImportSkipReason;
};

export type ImportWarning =
  /** Operaciones con impuesto en su fila: no se suma al coste. */
  | { code: "trade_tax_ignored"; count: number }
  /** Migración de custodia sin pareja: puede faltar historial. */
  | { code: "unbalanced_migration"; isin: string; line: number };

export type ImportParseResult = {
  /** Ordenadas por `executedAt` y por línea ante empate. */
  trades: ImportedTrade[];
  /** Cobros, en orden de fecha y de línea. */
  income: ImportedIncome[];
  skipped: ImportSkippedRow[];
  warnings: ImportWarning[];
};

export type ImportFailureCode = "NEGATIVE_QUANTITY" | "OVERFLOW" | "UNEXPECTED";

/** Filas descartadas por motivo; solo recuentos. */
export type SkippedSummary = { reason: ImportSkipReason; count: number };

export type ImportPlanPosition = {
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  /** `create`: no existe aún; `extend`: se añaden lotes a la existente. */
  action: "create" | "extend";
  newBuys: number;
  newSells: number;
  /** Operaciones del fichero ya importadas (por `external_id`). */
  duplicates: number;
  currentQuantity: number;
  /** Cantidad tras importar; `null` si la secuencia sería inválida. */
  resultingQuantity: number | null;
  /** Precio medio de coste tras importar, con precios de ejecución del fichero; `null` si queda cerrada o es inválida. */
  resultingAvgPrice: number | null;
  /** Presente si la posición no se podrá importar. */
  blockedBy: ImportFailureCode | null;
  /** Derivado: se registra pero no se sigue su precio ni suma a los totales. No bloquea. */
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
