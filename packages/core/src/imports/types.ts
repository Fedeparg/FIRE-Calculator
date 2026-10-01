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
