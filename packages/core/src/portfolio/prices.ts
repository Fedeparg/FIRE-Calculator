// Freshness of portfolio prices: which rows are valued with a price older than the last refresh.
//
// The maximum of the received dates is used because `GET /api/prices` returns one date per symbol
// and there is no global refresh marker. If all prices are equally old no row is flagged: without an
// external reference there is no way to know that day was not the right one.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DatedPrice {
  date: string;
}

/** Date of the most recent price (ISO, compared as text), or `null`; ignores unreadable formats. */
export function latestPriceDate(prices: Record<string, DatedPrice | undefined>): string | null {
  let latest: string | null = null;
  for (const price of Object.values(prices)) {
    const date = price?.date;
    if (!date || !ISO_DATE.test(date)) continue;
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

/**
 * `true` if the price predates the last refresh. Without a price, without a reference or with an
 * unreadable date it returns `false`: a missing price is already shown as "—".
 */
export function isStalePrice(price: DatedPrice | undefined, latest: string | null): boolean {
  if (!price || !latest) return false;
  if (!ISO_DATE.test(price.date)) return false;
  return price.date < latest;
}

/** The minimum needed to know when a price was read: the ISO instant it was fetched. */
export interface FetchedPrice {
  fetchedAt?: string;
}

/**
 * ISO instant of the most recent read. With intraday refreshes `date` stays the same all day, but
 * this one does not.
 */
export function latestFetchedAt(prices: Record<string, FetchedPrice | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const price of Object.values(prices)) {
    const iso = price?.fetchedAt;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms) || ms <= latestMs) continue;
    latest = iso;
    latestMs = ms;
  }
  return latest;
}

/**
 * Window during which a position without a price counts as "looking up the price". Resolving an ISIN
 * (Yahoo + OpenFIGI) takes from seconds to a couple of minutes; 10 minutes avoids an endless spinner.
 */
export const PENDING_PRICE_WINDOW_MS = 10 * 60_000;

export interface PendingPricePosition {
  isDerivative: boolean;
  createdAt: string;
}

/**
 * `true` if there is no price yet but the position is recent and the server is looking it up in the
 * background. Age is used because the API does not tell "pending" from "does not exist". An
 * unreadable `createdAt` is not pending; a negative age (clock skew) counts as just created.
 * Derivatives never are.
 */
export function isPricePending(
  position: PendingPricePosition,
  price: unknown,
  nowMs: number,
  windowMs: number = PENDING_PRICE_WINDOW_MS,
): boolean {
  if (position.isDerivative || price !== undefined) return false;
  const createdMs = Date.parse(position.createdAt);
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs < windowMs;
}
