// Changelog público ("Novedades"). Core puro (sin React, sin fs): valida el JSON
// generado desde el histórico de git, lo localiza, lo filtra y lo resume.
//
// El fichero `content/changelog/releases.json` lo genera un script a partir de
// `git log`, así que su contenido puede estar a medias (textos vacíos mientras se
// redactan) o mal formado si alguien lo edita a mano. Este módulo NO se fía de su
// forma: valida entrada a entrada y descarta lo que no encaja en vez de romper la
// página. Es la misma política que `components/wiki/content.ts` con el frontmatter.
//
// DOS REGLAS QUE CONVIENE TENER CLARAS:
//
// 1. «Cambio interno» = `hidden: true` (ruido puro) O `category: "internal"`
//    (docs, CI, chore, refactor). El interruptor de la interfaz gobierna ambos.
//    Si solo gobernara `hidden`, hoy sería un no-op (0 entradas ocultas) y los
//    cambios de fontanería se verían por defecto, que es justo lo contrario de lo
//    que queremos: la página la lee un usuario, no un desarrollador.
//
// 2. El campo `type` del commit (`feat`, `fix`, `ci`…) no se modela: `category`
//    ya lo resume y es lo único que la interfaz necesita pintar. Modelarlo sin
//    usarlo sería código muerto.

import { LOCALES, type Locale, type Localized } from "./types";

/** Categorías de cambio que la interfaz sabe etiquetar (color + icono + texto). */
export const CHANGELOG_CATEGORIES = ["feature", "fix", "security", "performance", "milestone", "internal"] as const;

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

/** Selección del filtro de categoría: una categoría concreta o «todas». */
export type ChangelogCategoryFilter = ChangelogCategory | "all";

/** Un cambio validado, todavía con sus textos en los dos idiomas. */
export interface ChangelogEntry {
  /** Hash corto del commit: identidad estable, sirve de `key` en el render. */
  hash: string;
  /** Ámbito del commit convencional (`portfolio`, `seo`…) o `null` si no lo tiene. */
  scope: string | null;
  category: ChangelogCategory;
  /** Puede traer cadenas vacías: los textos se redactan a mano tras generar el JSON. */
  text: Localized;
  hidden: boolean;
}

/** Una entrega (grupo de cambios publicados el mismo día) validada. */
export interface ChangelogRelease {
  /** Fecha en formato `YYYY-MM-DD`, ya comprobada como fecha real de calendario. */
  date: string;
  title: Localized;
  summary: Localized;
  highlight: boolean;
  entries: ChangelogEntry[];
}

/** Contenido completo del fichero, validado y ordenado por fecha descendente. */
export interface Changelog {
  generatedFrom: string;
  releases: ChangelogRelease[];
}

/** Un cambio ya resuelto a un idioma, listo para pintar. */
export interface LocalizedChangelogEntry {
  hash: string;
  scope: string | null;
  category: ChangelogCategory;
  text: string;
  /** `true` si es fontanería: lo esconde el interruptor de cambios internos. */
  internal: boolean;
}

/** Una entrega ya resuelta a un idioma. `null` donde no hay texto redactado. */
export interface LocalizedChangelogRelease {
  date: string;
  title: string | null;
  summary: string | null;
  highlight: boolean;
  entries: LocalizedChangelogEntry[];
}

/** Cifras del conjunto de entregas que se está mostrando. */
export interface ChangelogSummary {
  releaseCount: number;
  changeCount: number;
  /** Fecha de la entrega más antigua, o `null` si no hay ninguna. */
  firstDate: string | null;
  /** Fecha de la entrega más reciente, o `null` si no hay ninguna. */
  lastDate: string | null;
}

const CATEGORY_SET: ReadonlySet<string> = new Set(CHANGELOG_CATEGORIES);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Valida una fecha `YYYY-MM-DD` comprobando que además existe en el calendario
 * (descarta "2026-02-31", que `Date` normalizaría a marzo sin quejarse).
 */
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return false;
  return new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Lee un objeto `{ es, en }` tolerando ausencias: lo que falte queda como "". */
function parseLocalized(value: unknown): Localized {
  const source = isRecord(value) ? value : {};
  const result = {} as Record<Locale, string>;
  for (const locale of LOCALES) {
    result[locale] = asTrimmedString(source[locale]);
  }
  return result;
}

/** Valida un cambio. Devuelve `null` si le falta identidad o categoría conocida. */
function parseEntry(value: unknown): ChangelogEntry | null {
  if (!isRecord(value)) return null;

  const hash = asTrimmedString(value.hash);
  if (hash === "") return null;

  // Una categoría desconocida no se puede etiquetar (no hay ni color ni cadena
  // traducida para ella), así que se descarta el cambio en vez de inventarle una.
  const category = asTrimmedString(value.category);
  if (!CATEGORY_SET.has(category)) return null;

  const scope = asTrimmedString(value.scope);
  return {
    hash,
    scope: scope === "" ? null : scope,
    category: category as ChangelogCategory,
    text: parseLocalized(value.text),
    hidden: value.hidden === true,
  };
}

/** Valida una entrega. Devuelve `null` si la fecha no es utilizable. */
function parseRelease(value: unknown): ChangelogRelease | null {
  if (!isRecord(value)) return null;
  if (!isValidIsoDate(value.date)) return null;

  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  const entries = rawEntries.map(parseEntry).filter((entry): entry is ChangelogEntry => entry !== null);

  return {
    date: value.date,
    title: parseLocalized(value.title),
    summary: parseLocalized(value.summary),
    highlight: value.highlight === true,
    entries,
  };
}

/**
 * Valida el contenido bruto del fichero y devuelve las entregas ordenadas de más
 * reciente a más antigua. Las fechas son ISO, así que ordenan bien como cadenas
 * (sin construir `Date`, y por tanto sin desfases de zona horaria).
 *
 * Se descartan las entregas sin fecha válida y las que se quedan sin nada que
 * contar (ni cambios válidos, ni título, ni resumen en ningún idioma).
 */
export function parseChangelog(raw: unknown): Changelog {
  if (!isRecord(raw)) return { generatedFrom: "", releases: [] };

  const rawReleases = Array.isArray(raw.releases) ? raw.releases : [];
  const releases = rawReleases
    .map(parseRelease)
    .filter((release): release is ChangelogRelease => release !== null)
    .filter((release) => release.entries.length > 0 || hasAnyText(release))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { generatedFrom: asTrimmedString(raw.generatedFrom), releases };
}

/** ¿La entrega tiene título o resumen redactado en algún idioma? */
function hasAnyText(release: ChangelogRelease): boolean {
  return LOCALES.some((locale) => release.title[locale] !== "" || release.summary[locale] !== "");
}

/**
 * Resuelve un texto al idioma activo, cayendo al otro idioma si todavía no está
 * traducido. El JSON se genera con los textos en castellano y se traduce después,
 * así que sin este fallback `/en/novedades` mostraría filas en blanco durante
 * toda la ventana entre generar y traducir. Vale más un texto en el otro idioma
 * que ningún texto.
 */
function pickText(text: Localized, locale: Locale): string {
  if (text[locale] !== "") return text[locale];
  for (const other of LOCALES) {
    if (other !== locale && text[other] !== "") return text[other];
  }
  return "";
}

/** ¿Es fontanería? Ver la regla 1 de la cabecera del módulo. */
function isInternal(entry: ChangelogEntry): boolean {
  return entry.hidden || entry.category === "internal";
}

/**
 * Resuelve el changelog a un idioma. Los cambios sin texto en ningún idioma se
 * descartan (una viñeta vacía no informa de nada); el título y el resumen quedan
 * a `null` cuando no hay texto, y la interfaz cae a la fecha formateada.
 */
export function localizeReleases(releases: readonly ChangelogRelease[], locale: Locale): LocalizedChangelogRelease[] {
  const localized: LocalizedChangelogRelease[] = [];

  for (const release of releases) {
    const entries: LocalizedChangelogEntry[] = [];
    for (const entry of release.entries) {
      const text = pickText(entry.text, locale);
      if (text === "") continue;
      entries.push({
        hash: entry.hash,
        scope: entry.scope,
        category: entry.category,
        text,
        internal: isInternal(entry),
      });
    }

    const title = pickText(release.title, locale);
    const summary = pickText(release.summary, locale);
    // Una entrega sin cambios legibles y sin titular no aporta nada al lector.
    if (entries.length === 0 && title === "" && summary === "") continue;

    localized.push({
      date: release.date,
      title: title === "" ? null : title,
      summary: summary === "" ? null : summary,
      highlight: release.highlight,
      entries,
    });
  }

  return localized;
}

/** Estado de los dos controles de la página. */
export interface ChangelogFilter {
  category: ChangelogCategoryFilter;
  /** Por defecto `false`: la fontanería no se muestra salvo que se pida. */
  includeInternal: boolean;
}

/**
 * Aplica el filtro a las entregas ya localizadas. Una entrega que se queda sin
 * cambios visibles desaparece de la línea temporal: pintar un nodo vacío sería
 * ruido y además rompería la lectura del recorrido cronológico.
 */
export function filterReleases(
  releases: readonly LocalizedChangelogRelease[],
  filter: ChangelogFilter,
): LocalizedChangelogRelease[] {
  const result: LocalizedChangelogRelease[] = [];

  for (const release of releases) {
    const entries = release.entries.filter((entry) => {
      if (!filter.includeInternal && entry.internal) return false;
      if (filter.category !== "all" && entry.category !== filter.category) return false;
      return true;
    });
    if (entries.length === 0) continue;
    result.push({ ...release, entries });
  }

  return result;
}

/**
 * Categorías realmente presentes en las entregas dadas, en el orden canónico de
 * `CHANGELOG_CATEGORIES`. Alimenta los chips del filtro para no ofrecer opciones
 * que no devolverían nada.
 */
export function availableCategories(releases: readonly LocalizedChangelogRelease[]): ChangelogCategory[] {
  const present = new Set<ChangelogCategory>();
  for (const release of releases) {
    for (const entry of release.entries) present.add(entry.category);
  }
  return CHANGELOG_CATEGORIES.filter((category) => present.has(category));
}

/**
 * Cifras del conjunto: cuántas entregas, cuántos cambios y desde/hasta cuándo.
 * Se calcula sobre lo que se está mostrando (post-filtro), de modo que el bloque
 * de resumen hace también de contador de resultados del filtro.
 */
export function summarizeReleases(releases: readonly LocalizedChangelogRelease[]): ChangelogSummary {
  let changeCount = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const release of releases) {
    changeCount += release.entries.length;
    if (firstDate === null || release.date < firstDate) firstDate = release.date;
    if (lastDate === null || release.date > lastDate) lastDate = release.date;
  }

  return { releaseCount: releases.length, changeCount, firstDate, lastDate };
}
