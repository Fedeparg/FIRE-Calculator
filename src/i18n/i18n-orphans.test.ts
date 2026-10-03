// Guardarraíl de i18n: una clave de `messages/es.json` que ningún código usa es
// texto muerto que además hay que traducir y mantener en paridad. Este test falla
// con esas claves huérfanas.
//
// El análisis es textual, no semántico: una clave `ns.rest` cuenta como usada si
// un fichero de `src/` contiene el literal completo `"ns.rest"` o, a la manera de
// next-intl, el literal del namespace (`useTranslations("ns")`) y el de la clave
// relativa (`t("rest")`). Para las claves que se construyen dinámicamente
// (`t(`range.${key}`)`) no hay literal que buscar: van en `DYNAMIC_PREFIXES`.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flattenMessages, loadMessages, ROOT } from "./messages-fixtures";

/**
 * Prefijos cuyas claves se resuelven en tiempo de ejecución a partir de datos
 * (slugs, enums, ids de pregunta…), de modo que el código no contiene el literal.
 * Añade aquí un prefijo solo si la clave se compone de verdad dinámicamente.
 */
const DYNAMIC_PREFIXES: readonly string[] = [
  // Compuestas con una plantilla: t(`items.${key}.title`), t(`level.${level}`)…
  "landing.pillars.items.",
  // Nombre y descripción de cada calculadora: t(`${slug}.name`) sobre el catálogo.
  "catalog.",
  "wiki.level.",
  "frequency.",
  "region.name.",
  "region.reason.",
  "calc.simulador-montecarlo.models.",
  "calc.salud-financiera.questions.",
  "calc.salud-financiera.category.",
  "calc.salud-financiera.advice.",
  "portfolio.goal.mode.",
  "portfolio.list.gainMode.",
  "portfolio.list.sort.",
  "portfolio.form.search.type.",
  "portfolio.history.range.",
  "portfolio.breakdown.group.",
  "portfolio.import.preview.action.",
  "portfolio.import.preview.blocked.",
  "portfolio.import.skipReasons.",
  "portfolio.import.result.status.",
  "portfolio.import.result.failure.",
  "portfolio.positions.filter.",
  "portfolio.positions.empty.",
  "portfolio.income.kinds.",
  "portfolio.realisedGains.blocks.",
  "portfolio.realisedGains.assetClasses.",
  // Cabeceras del CSV: `realisedGainsCsvHeaders` las compone con t(`csv.${column}`).
  "portfolio.realisedGains.csv.",
  "portfolio.form.assetClasses.",
  "portfolio.income.sources.",
  "account.notifications.languages.",
  // Claves de error que devuelve una función tipada (`ApiErrorKey`,
  // `ImportErrorKey`…) y el componente traduce con `t(key)`.
  "calculator.scenarios.error",
  "portfolio.form.error",
  "portfolio.lots.error",
  "portfolio.income.error",
  "portfolio.pendingBalances.error",
  "portfolio.import.error",
  "account.error",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Código fuente de la app (sin tests, que no cuentan como uso real). */
function readSources(): string[] {
  const dir = path.join(ROOT, "src");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(path.join(dir, file), "utf8"));
}

/** ¿Contiene el fuente el literal de cadena `text` (comillas simples, dobles o plantilla)? */
function hasLiteral(source: string, text: string): boolean {
  return ['"', "'", "`"].some((quote) => source.includes(`${quote}${text}${quote}`));
}

function isUsed(key: string, sources: readonly string[]): boolean {
  const parts = key.split(".");
  // `calc.<slug>`: el namespace llega por prop o desde el registry, no como
  // literal junto a la clave. Se comprueba la clave relativa al slug en cualquier fichero.
  if (parts[0] === "calc" && parts.length > 2) {
    // `<NumField>` deriva la ayuda de la clave del campo (`help.<clave>`): basta el literal de la clave.
    const relative =
      parts[2] === "help" && parts.length > 3
        ? [parts.slice(2).join("."), parts.slice(3).join(".")]
        : [parts.slice(2).join(".")];
    return sources.some((source) => relative.some((key) => hasLiteral(source, key)));
  }
  return sources.some((source) =>
    // Cada partición posible: namespace = parts[0..i), clave relativa = parts[i..].
    parts.some((_, i) => {
      const relative = parts.slice(i).join(".");
      if (i === 0) return hasLiteral(source, relative);
      return hasLiteral(source, parts.slice(0, i).join(".")) && hasLiteral(source, relative);
    }),
  );
}

describe("claves de mensajes huérfanas", () => {
  it("toda clave de es.json se usa en el código (o es dinámica y está permitida)", () => {
    const sources = readSources();
    const orphans = [...flattenMessages(loadMessages("es")).keys()]
      .filter((key) => !DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .filter((key) => !isUsed(key, sources));
    expect(orphans).toEqual([]);
  });
});
