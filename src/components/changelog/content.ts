import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { parseChangelog, type Changelog } from "@/core/changelog";

/**
 * Lectura del changelog desde disco. Mismo patrón que `components/wiki/content.ts`:
 * el contenido vive en `content/`, se lee en runtime (no se importa como módulo) y
 * la página lo cachea con ISR, de modo que regenerar el JSON en el servidor se
 * publica sin redesplegar.
 *
 * La validación vive en `core/changelog.ts` (puro y testeable); aquí solo está el
 * acceso a fichero.
 */
const CHANGELOG_FILE = path.join(process.cwd(), "content", "changelog", "releases.json");

/** Changelog validado. Si el fichero no existe o no es JSON, devuelve uno vacío. */
export async function getChangelog(): Promise<Changelog> {
  let raw: string;
  try {
    raw = await fs.readFile(CHANGELOG_FILE, "utf8");
  } catch {
    return { generatedFrom: "", releases: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Un JSON corrupto no debe tumbar el build: la página se degrada a "sin novedades".
    return { generatedFrom: "", releases: [] };
  }

  return parseChangelog(parsed);
}

/**
 * Fecha de la entrega más reciente (`YYYY-MM-DD`) o `undefined` si no hay ninguna.
 * Alimenta el `lastModified` del sitemap: aquí sí hay una fecha REAL de contenido,
 * a diferencia de las calculadoras (ver la cabecera de `app/sitemap.ts`).
 */
export async function getChangelogLastUpdated(): Promise<string | undefined> {
  const { releases } = await getChangelog();
  // `parseChangelog` ya las devuelve en orden descendente.
  return releases[0]?.date;
}
