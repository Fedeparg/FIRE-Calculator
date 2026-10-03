// Constants shared with the API: duplicating them would cause 400s if the UI and the API drift.

/** The 10 most traded currencies (FX turnover, BIS); EUR first (the default). */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "HKD", "SGD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Per-user scenario cap; the API enforces it and the UI only warns. */
export const MAX_SCENARIOS_PER_USER = 50;

export const SCENARIO_NAME_MAX_LENGTH = 100;

export const MIN_INSTRUMENT_QUERY_LENGTH = 2;

export const SESSION_COOKIE = "sextante_session";

// Shape of the API responses as they travel over JSON (dates as ISO strings). The API declares them
// as return types and the frontend consumes them with `useApiQuery<T>`: if one changes, the
// typecheck fails on both sides.

/** `GET /api/auth/me`. */
export type SessionUser = { id: string; email: string };

/** Saved calculator scenario (`/api/scenarios`). */
export type SavedScenarioResponse = {
  id: string;
  slug: string;
  name: string;
  inputs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Connected OAuth/MCP application (`GET /api/account/connections`). */
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

/** Email notification preferences (`/api/account/notifications`). */
export type NotificationSettingsResponse = {
  fireAlertsEnabled: boolean;
  locale: NotificationLocale;
  /** Last milestone notified (25/50/75/100), or null if there is no reference yet. */
  lastFireMilestone: number | null;
  /**
   * Goal the alerts watch: the most recently updated FIRE scenario. `null` if the user has not
   * saved any (the alerts have nothing to notify about).
   */
  goal: { name: string; updatedAt: string } | null;
};
