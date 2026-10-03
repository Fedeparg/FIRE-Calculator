"use client";

import { useState } from "react";

import { UTF8_BOM } from "@/shared/format/csv";
import { downloadBlob } from "@/shared/format/download";

/**
 * Downloads CSVs generated in the browser, with a failure state to report it. Only the browser
 * can fail (memory, blocked downloads): the content is already computed.
 */
export function useCsvDownload() {
  const [failed, setFailed] = useState(false);

  /** Builds the CSV with `build` and downloads it as `fileName`. `true` on success. */
  function download(build: () => string, fileName: string): boolean {
    setFailed(false);
    try {
      // BOM: without it, Excel opens the file as Windows-1252 and mangles accents and the €.
      downloadBlob(new Blob([UTF8_BOM, build()], { type: "text/csv;charset=utf-8" }), fileName);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }

  return { failed, download };
}
