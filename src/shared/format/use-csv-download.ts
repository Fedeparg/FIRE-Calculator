"use client";

import { useState } from "react";

import { UTF8_BOM } from "@/shared/format/csv";
import { downloadBlob } from "@/shared/format/download";

/**
 * Descarga de CSV generados en el navegador, con el estado de fallo para avisar. Solo puede
 * fallar el navegador (memoria, descargas bloqueadas): el contenido ya está calculado.
 */
export function useCsvDownload() {
  const [failed, setFailed] = useState(false);

  /** Genera el CSV con `build` y lo descarga como `fileName`. `true` si salió bien. */
  function download(build: () => string, fileName: string): boolean {
    setFailed(false);
    try {
      // BOM: sin él, Excel abre en Windows-1252 y estropea las tildes y el €.
      downloadBlob(new Blob([UTF8_BOM, build()], { type: "text/csv;charset=utf-8" }), fileName);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }

  return { failed, download };
}
