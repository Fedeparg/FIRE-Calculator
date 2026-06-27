"use client";

import { useEffect, useRef } from "react";

/**
 * Hueco de publicidad (AdSense), discreto y al final del contenido. No renderiza
 * nada hasta que se configuren NEXT_PUBLIC_ADSENSE_CLIENT_ID y _SLOT, de modo que
 * nunca mostramos un banner vacío. El script global lo carga <AdsenseScript/> en el
 * layout; el consentimiento GDPR lo gestiona la CMP de Google (consola de AdSense).
 * Ver _local/monetizacion.md.
 */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

type Props = { className?: string };

export default function AdSlot({ className = "" }: Props) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || !SLOT || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // adsbygoogle aún no disponible / bloqueado: no es crítico.
    }
  }, []);

  if (!CLIENT_ID || !SLOT) return null;

  return (
    <div className={className} aria-label="Publicidad">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
