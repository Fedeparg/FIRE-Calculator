// Constantes compartidas con la API: duplicarlas daría 400 si la UI y la API se desfasan.

/** Las 10 divisas más negociadas (turnover FX, BIS); EUR primero (por defecto). */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "HKD", "SGD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Tope de escenarios por usuario; la API lo aplica y la UI solo avisa. */
export const MAX_SCENARIOS_PER_USER = 50;

export const SCENARIO_NAME_MAX_LENGTH = 100;

export const MIN_INSTRUMENT_QUERY_LENGTH = 2;

export const SESSION_COOKIE = "sextante_session";

// Forma de las respuestas de la API tal y como viajan por JSON (fechas como ISO string). La API las
// declara como tipo de retorno y el frontend las consume con `useApiQuery<T>`: si una cambia, falla
// el typecheck en los dos lados.

/** `GET /api/auth/me`. */
export type SessionUser = { id: string; email: string };

/** Escenario guardado de calculadora (`/api/scenarios`). */
export type SavedScenarioResponse = {
  id: string;
  slug: string;
  name: string;
  inputs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Aplicación OAuth/MCP conectada (`GET /api/account/connections`). */
export type ConnectedApp = {
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export const NOTIFICATION_LOCALES = ["es", "en"] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

/** Preferencias de avisos por email (`/api/account/notifications`). */
export type NotificationSettingsResponse = {
  fireAlertsEnabled: boolean;
  locale: NotificationLocale;
  /** Último hito avisado (25/50/75/100), o null si aún no hay referencia. */
  lastFireMilestone: number | null;
  /**
   * Objetivo que vigilan las alertas: el escenario FIRE actualizado más recientemente. `null`
   * si el usuario no ha guardado ninguno (las alertas no pueden avisar de nada).
   */
  goal: { name: string; updatedAt: string } | null;
};
