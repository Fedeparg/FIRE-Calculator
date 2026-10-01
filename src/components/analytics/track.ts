/**
 * Eventos de producto que se miden, además de las visitas. La lista es cerrada a
 * propósito: un evento nuevo se añade aquí y en la política de privacidad.
 *
 * Regla de privacidad: los datos de un evento NUNCA llevan cifras ni datos
 * personales (importes, emails, tickers). Como mucho, el slug público de la
 * calculadora.
 */
export type AnalyticsEvent =
  | { name: "share-link-copied"; data: { calculator: string } }
  | { name: "scenario-saved"; data: { calculator: string } }
  | { name: "login-link-requested" }
  | { name: "position-added" }
  | { name: "donation-checkout-started" };

type EventData = Record<string, string>;

/** API global que expone el tracker de Umami una vez cargado. */
type UmamiTracker = { track: (name: string, data?: EventData) => unknown };

function tracker(): UmamiTracker | null {
  if (typeof window === "undefined") return null;
  const umami = (window as Window & { umami?: UmamiTracker }).umami;
  return typeof umami?.track === "function" ? umami : null;
}

/**
 * Registra un evento. No hace nada si la analítica está apagada, el script aún no ha
 * cargado o lo bloquea el navegador (Do Not Track, bloqueadores): medir nunca puede
 * romper ni retrasar la acción del usuario.
 */
export function trackEvent(event: AnalyticsEvent): void {
  const umami = tracker();
  if (!umami) return;
  try {
    umami.track(event.name, "data" in event ? event.data : undefined);
  } catch {
    // El tracker es código externo: un fallo suyo no debe propagarse a la UI.
  }
}
