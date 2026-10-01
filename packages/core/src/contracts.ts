// Constantes del contrato entre el frontend y la API. Viven aquí (y no duplicadas a mano en cada
// lado) porque un desfase entre las dos copias se manifestaría como un 400 en producción: la UI
// dejaría elegir algo que la API rechaza, o al revés.

/** Divisas admitidas: las 10 más negociadas del mundo (turnover FX, BIS). EUR primero (valor por defecto). */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "HKD", "SGD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Tope de escenarios por usuario. Es una conveniencia de la cuenta ("mi plan a los 45", "mi
 * plan pesimista"), no un gestor documental: 50 es holgado para el uso real y acota el coste
 * de un usuario que automatizase el guardado. La API lo aplica; la UI solo avisa antes.
 */
export const MAX_SCENARIOS_PER_USER = 50;

/** Longitud máxima del nombre de un escenario guardado. */
export const SCENARIO_NAME_MAX_LENGTH = 100;

/** Longitud mínima de la consulta del buscador de instrumentos: por debajo, no se llama a la fuente. */
export const MIN_INSTRUMENT_QUERY_LENGTH = 2;

/** Nombre de la cookie de sesión (JWT). */
export const SESSION_COOKIE = "sextante_session";
