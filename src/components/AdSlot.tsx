/**
 * Hueco de publicidad, discreto y fuera de la vista principal (al final del
 * contenido). No renderiza nada hasta que se configure AdSense vía
 * NEXT_PUBLIC_ADSENSE_CLIENT_ID, de modo que nunca mostramos un banner falso.
 * La integración real (script + CMP de consentimiento GDPR) llega en la fase de
 * monetización; ver _local/monetizacion.md.
 */
type Props = { className?: string };

export default function AdSlot({ className = "" }: Props) {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <div
      className={`flex min-h-[90px] items-center justify-center rounded-lg border border-dashed border-border bg-surface text-xs text-muted ${className}`}
      aria-label="Publicidad"
      data-ad-client={clientId}
    >
      {/* La unidad de anuncio se inyecta aquí en la fase de monetización. */}
    </div>
  );
}
