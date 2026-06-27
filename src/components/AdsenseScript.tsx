import Script from "next/script";

/**
 * Carga el script global de Google AdSense una sola vez (en el layout). No hace
 * nada hasta que NEXT_PUBLIC_ADSENSE_CLIENT_ID esté configurado, de modo que en
 * desarrollo y antes de la aprobación de AdSense no cargamos nada de Google.
 * El consentimiento GDPR (EEA) lo gestiona la CMP certificada de Google, que se
 * activa desde la consola de AdSense ("Privacidad y mensajes"); no montamos un
 * banner de cookies propio. Ver _local/monetizacion.md.
 */
const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export default function AdsenseScript() {
  if (!CLIENT_ID) return null;

  return (
    <Script
      id="adsbygoogle-init"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`}
    />
  );
}
