/** Clase de color de un texto de ganancia o pérdida. */
export type SignedTone = "text-success" | "text-danger" | "text-foreground" | "text-muted";

/**
 * Color de una cifra con signo: verde si es positiva, rojo si es negativa y `neutral` si es cero
 * (incluido el -0) o no hay cifra. El neutro cambia según el sitio: el texto normal en un total,
 * gris donde el cero es "sin novedad" (los movimientos del día).
 */
export function signedTone(
  value: number | null | undefined,
  neutral: "text-foreground" | "text-muted" = "text-foreground",
): SignedTone {
  if (value === null || value === undefined || !(value > 0 || value < 0)) return neutral;
  return value > 0 ? "text-success" : "text-danger";
}
