"use client";

// Price status of a row in the positions list: stale or still being fetched.

/**
 * Stale price marker: the row is valued with a price older than the last refresh (typically a
 * fund with a delayed NAV alongside assets quoted daily). The explanation lives in an `sr-only`:
 * a `title` does not reach keyboard or screen reader users.
 */
export function StaleBadge({ label }: { label: string }) {
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 fill-current text-warning">
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm-.75 2.5a.75.75 0 011.5 0v3.19l2.03 2.03a.75.75 0 11-1.06 1.06l-2.25-2.25a.75.75 0 01-.22-.53V6.5z"
          clipRule="evenodd"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * "Fetching price" status: a pulsing dot (only if the user does not ask for reduced motion) plus
 * visible text. `role="status"` announces it once; the long explanation goes in `sr-only`.
 */
export function PendingPrice({ label, hint }: { label: string; hint: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted" title={hint}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" />
      {label}
      <span className="sr-only">{hint}</span>
    </span>
  );
}
