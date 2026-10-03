/**
 * Lista cerrada: un evento nuevo se añade aquí y en la política de privacidad. Sus datos
 * no llevan cifras ni datos personales (importes, emails, tickers), como mucho el slug.
 */
export type AnalyticsEvent =
  | { name: "share-link-copied"; data: { calculator: string } }
  | { name: "scenario-saved"; data: { calculator: string } }
  | { name: "login-link-requested" }
  | { name: "position-added" }
  | { name: "broker-import-completed"; data: { broker: string } }
  | { name: "donation-checkout-started" }
  | { name: "tax-report-viewed" }
  | { name: "tax-report-year-changed" }
  | { name: "tax-report-exported"; data: { format: "csv" | "print" } };

type EventData = Record<string, string>;

type UmamiTracker = { track: (name: string, data?: EventData) => unknown };

function tracker(): UmamiTracker | null {
  if (typeof window === "undefined") return null;
  const umami = (window as Window & { umami?: UmamiTracker }).umami;
  return typeof umami?.track === "function" ? umami : null;
}

/** No-op si la analítica está apagada o bloqueada: medir nunca debe romper la acción. */
export function trackEvent(event: AnalyticsEvent): void {
  const umami = tracker();
  if (!umami) return;
  try {
    umami.track(event.name, "data" in event ? event.data : undefined);
  } catch {
    // El tracker es código externo: un fallo suyo no debe propagarse a la UI.
  }
}
