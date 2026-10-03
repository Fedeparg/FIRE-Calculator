"use client";

// Estado del precio de una fila de la lista de posiciones: rezagado o aún buscándose.

/**
 * Marca de precio rezagado: la fila se valora con un precio anterior al del último refresco
 * (típicamente un fondo con valor liquidativo diferido junto a activos cotizados al día). La
 * explicación va en un `sr-only`: un `title` no llega a teclado ni a lector de pantalla.
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
 * Estado "buscando precio": un punto que pulsa (solo si el usuario no pide menos movimiento)
 * más texto visible. `role="status"` lo anuncia una vez; la explicación larga va en `sr-only`.
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
