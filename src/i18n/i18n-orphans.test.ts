// i18n guardrail: a `messages/es.json` key that no code uses is dead text that still
// has to be translated and kept in parity. This test fails on such orphan keys.
//
// The analysis is textual, not semantic: a key `ns.rest` counts as used if a file in
// `src/` contains the full literal `"ns.rest"` or, the next-intl way, the namespace
// literal (`useTranslations("ns")`) and the relative key literal (`t("rest")`). Keys
// built dynamically (`t(`range.${key}`)`) have no literal to look for: they go in
// `DYNAMIC_PREFIXES`.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flattenMessages, loadMessages, ROOT } from "./messages-fixtures";

/**
 * Prefixes whose keys are resolved at runtime from data (slugs, enums, question
 * ids…), so the code does not contain the literal. Only add a prefix here if the
 * key really is built dynamically.
 */
const DYNAMIC_PREFIXES: readonly string[] = [
  // Built from a template: t(`items.${key}.title`), t(`level.${level}`)…
  "landing.pillars.items.",
  // Each calculator's name and description: t(`${slug}.name`) on the catalog.
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
  // CSV headers: `realisedGainsCsvHeaders` builds them with t(`csv.${column}`).
  "portfolio.realisedGains.csv.",
  "portfolio.form.assetClasses.",
  "portfolio.income.sources.",
  "account.notifications.languages.",
  // Error keys returned by a typed function (`ApiErrorKey`, `ImportErrorKey`…)
  // that the component translates with `t(key)`.
  "calculator.scenarios.error",
  "portfolio.form.error",
  "portfolio.lots.error",
  "portfolio.income.error",
  "portfolio.pendingBalances.error",
  "portfolio.import.error",
  "account.error",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** App source code (excluding tests, which do not count as real usage). */
function readSources(): string[] {
  const dir = path.join(ROOT, "src");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(path.join(dir, file), "utf8"));
}

/** Does the source contain the string literal `text` (single, double or template quotes)? */
function hasLiteral(source: string, text: string): boolean {
  return ['"', "'", "`"].some((quote) => source.includes(`${quote}${text}${quote}`));
}

function isUsed(key: string, sources: readonly string[]): boolean {
  const parts = key.split(".");
  // `calc.<slug>`: the namespace arrives via a prop or from the registry, not as a literal
  // next to the key. The key relative to the slug is checked in any file.
  if (parts[0] === "calc" && parts.length > 2) {
    // `<NumField>` derives the help text from the field key (`help.<key>`): the key literal is enough.
    const relative =
      parts[2] === "help" && parts.length > 3
        ? [parts.slice(2).join("."), parts.slice(3).join(".")]
        : [parts.slice(2).join(".")];
    return sources.some((source) => relative.some((key) => hasLiteral(source, key)));
  }
  return sources.some((source) =>
    // Every possible split: namespace = parts[0..i), relative key = parts[i..].
    parts.some((_, i) => {
      const relative = parts.slice(i).join(".");
      if (i === 0) return hasLiteral(source, relative);
      return hasLiteral(source, parts.slice(0, i).join(".")) && hasLiteral(source, relative);
    }),
  );
}

describe("orphan message keys", () => {
  it("every es.json key is used in the code (or is dynamic and allow-listed)", () => {
    const sources = readSources();
    const orphans = [...flattenMessages(loadMessages("es")).keys()]
      .filter((key) => !DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .filter((key) => !isUsed(key, sources));
    expect(orphans).toEqual([]);
  });
});
