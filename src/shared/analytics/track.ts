/**
 * Closed list: a new event is added here and to the privacy policy. Its data carries no figures
 * or personal data (amounts, emails, tickers); at most the slug.
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

/** No-op if analytics is off or blocked: tracking must never break the action. */
export function trackEvent(event: AnalyticsEvent): void {
  const umami = tracker();
  if (!umami) return;
  try {
    umami.track(event.name, "data" in event ? event.data : undefined);
  } catch {
    // The tracker is third-party code: its failures must not reach the UI.
  }
}
