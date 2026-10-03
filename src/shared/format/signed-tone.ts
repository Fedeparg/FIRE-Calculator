/** Colour class for a gain or loss text. */
export type SignedTone = "text-success" | "text-danger" | "text-foreground" | "text-muted";

/**
 * Colour of a signed figure: green if positive, red if negative and `neutral` if zero
 * (including -0) or missing. The neutral tone depends on the context: regular text for a total,
 * grey where zero means "nothing new" (the day's changes).
 */
export function signedTone(
  value: number | null | undefined,
  neutral: "text-foreground" | "text-muted" = "text-foreground",
): SignedTone {
  if (value === null || value === undefined || !(value > 0 || value < 0)) return neutral;
  return value > 0 ? "text-success" : "text-danger";
}
