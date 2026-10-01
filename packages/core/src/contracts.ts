// Constantes compartidas con la API: duplicarlas daría 400 si la UI y la API se desfasan.

/** Las 10 divisas más negociadas (turnover FX, BIS); EUR primero (por defecto). */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "HKD", "SGD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Tope de escenarios por usuario; la API lo aplica y la UI solo avisa. */
export const MAX_SCENARIOS_PER_USER = 50;

export const SCENARIO_NAME_MAX_LENGTH = 100;

export const MIN_INSTRUMENT_QUERY_LENGTH = 2;

export const SESSION_COOKIE = "sextante_session";
