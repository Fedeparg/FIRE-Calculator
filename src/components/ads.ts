// Estado de la publicidad (AdSense), centralizado. Valores estáticos leídos del
// entorno en build (NEXT_PUBLIC_* se inlinea en el cliente). NO es "use client":
// así pueden importarlo tanto Server como Client Components.
//
//   - ADS_LIVE    → hay Publisher ID + slot: se sirven anuncios reales de Google.
//   - ADS_PREVIEW → maquetación: placeholders visibles, SIN cargar Google.
//   - ADS_ENABLED → hay algo que mostrar (real o preview). Si es false, los huecos
//                   no existen: el layout colapsa a una sola columna. Es el estado
//                   por defecto en producción hasta activar AdSense.
//
// Ver _local/monetizacion.md y src/components/AdSlot.tsx.
export const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
export const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

export const ADS_LIVE = Boolean(ADSENSE_CLIENT_ID && ADSENSE_SLOT);
export const ADS_PREVIEW = process.env.NEXT_PUBLIC_AD_PREVIEW === "1";
export const ADS_ENABLED = ADS_LIVE || ADS_PREVIEW;
