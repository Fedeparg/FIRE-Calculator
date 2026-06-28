"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ADS_LIVE, ADS_PREVIEW, ADSENSE_CLIENT_ID, ADSENSE_SLOT } from "./ads";

/**
 * Hueco de publicidad (AdSense), discreto y al final del contenido. Tres estados:
 *
 *   1. Anuncio real — si NEXT_PUBLIC_ADSENSE_CLIENT_ID y _SLOT están definidos
 *      (es decir, tras la aprobación de AdSense). Renderiza el <ins> de Google.
 *   2. Vista previa — si NEXT_PUBLIC_AD_PREVIEW="1" (solo para maquetar y ver la
 *      ubicación en dev). Renderiza un placeholder, NUNCA el script de Google.
 *   3. Nada — por defecto (return null). Es lo que se sirve en producción mientras
 *      no haya Publisher ID, de modo que un merge a `main` no muestra cajas vacías.
 *
 * El script global lo carga <AdsenseScript/> en el layout; el consentimiento GDPR
 * lo gestiona la CMP certificada de Google (consola de AdSense), no un banner
 * propio. Ver _local/monetizacion.md.
 */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type Props = {
  className?: string;
  /** Altura mínima del placeholder de preview (Tailwind). El lateral usa más. */
  previewMinH?: string;
};

export default function AdSlot({ className = "", previewMinH = "min-h-24" }: Props) {
  const t = useTranslations("ads");
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADS_LIVE || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // adsbygoogle aún no disponible / bloqueado: no es crítico.
    }
  }, []);

  if (ADS_LIVE) {
    return (
      <div className={className} aria-label={t("label")}>
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={ADSENSE_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  if (ADS_PREVIEW) {
    return (
      <div className={className} aria-hidden="true">
        <div
          className={`flex ${previewMinH} w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-6 text-center`}
        >
          <span className="text-sm font-medium text-muted">{t("label")}</span>
          <span className="text-xs text-muted/80">{t("previewHint")}</span>
        </div>
      </div>
    );
  }

  return null;
}
