"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { buildPortfolioCsv, UTF8_BOM } from "@/features/portfolio/model/csv";
import { asLocale } from "@/core/types";
import { downloadBlob } from "@/shared/format/download";
import type { PriceInfo, Position } from "@sextante/core/portfolio/types";

type Props = {
  positions: Position[];
  /** Último precio conocido por ticker (desde nuestra DB). */
  prices: Record<string, PriceInfo>;
  /** USD por unidad de cada divisa (USD = 1). */
  rates: Record<string, number>;
  /** Divisa elegida: en ella va la columna de valoración. */
  display: string;
};

/** Nombre del fichero descargado. Fijo: identifica el origen sin exponer nada del usuario. */
const FILE_NAME = "sextante-cartera.csv";

/**
 * Descarga de la cartera en CSV. Se genera ENTERAMENTE en el cliente a partir de los datos que
 * ya están en pantalla (posiciones, precios y tasas): no hay endpoint nuevo ni una segunda
 * lectura de la API que pudiera devolver algo distinto de lo que se está viendo.
 *
 * El texto lo construye `buildPortfolioCsv` (core puro y testeado), que decide el dialecto
 * según el idioma para que Excel lo abra bien. Aquí solo se traducen las cabeceras y se lanza
 * la descarga (`downloadBlob`).
 */
export default function PortfolioExport({ positions, prices, rates, display }: Props) {
  const t = useTranslations("portfolio.export");
  const locale = asLocale(useLocale());
  const [failed, setFailed] = useState(false);

  function handleDownload() {
    setFailed(false);
    try {
      const csv = buildPortfolioCsv({
        positions,
        prices,
        rates,
        display,
        locale,
        // Las cabeceras se traducen aquí: el core no traduce (mismo criterio que el resto).
        headers: {
          ticker: t("headers.ticker"),
          name: t("headers.name"),
          quantity: t("headers.quantity"),
          avgPrice: t("headers.avgPrice"),
          currency: t("headers.currency"),
          broker: t("headers.broker"),
          lastPrice: t("headers.lastPrice"),
          priceCurrency: t("headers.priceCurrency"),
          priceDate: t("headers.priceDate"),
          marketValue: t("headers.marketValue", { currency: display }),
        },
      });
      // El BOM va delante del contenido: sin él, Excel lee el fichero en su página de códigos
      // local y destroza los acentos.
      downloadBlob(new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" }), FILE_NAME);
    } catch {
      // Un fallo aquí solo puede venir del navegador (memoria, descargas bloqueadas): se avisa
      // en vez de dejar un botón que aparentemente no hace nada.
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {failed && (
        <p role="alert" className="text-sm text-warning">
          {t("error")}
        </p>
      )}
      <button
        type="button"
        onClick={handleDownload}
        className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-surface-2"
      >
        {t("button")}
      </button>
    </div>
  );
}
