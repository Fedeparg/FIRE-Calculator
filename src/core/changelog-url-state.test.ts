import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHANGELOG_FILTER,
  decodeChangelogFilter,
  encodeChangelogFilter,
} from "./changelog-url-state";

describe("decodeChangelogFilter", () => {
  it("sin query devuelve el estado por defecto", () => {
    expect(decodeChangelogFilter("")).toEqual(DEFAULT_CHANGELOG_FILTER);
  });

  it("lee una categoría válida", () => {
    expect(decodeChangelogFilter("?cat=security")).toEqual({
      category: "security",
      includeInternal: false,
    });
  });

  it("una categoría desconocida cae en «todas», sin romper la página", () => {
    expect(decodeChangelogFilter("?cat=<script>").category).toBe("all");
    expect(decodeChangelogFilter("?cat=").category).toBe("all");
  });

  it("«all» es un valor legítimo, aunque no se escriba", () => {
    expect(decodeChangelogFilter("?cat=all").category).toBe("all");
  });

  it("solo «1» activa los cambios internos", () => {
    expect(decodeChangelogFilter("?internal=1").includeInternal).toBe(true);
    expect(decodeChangelogFilter("?internal=0").includeInternal).toBe(false);
    expect(decodeChangelogFilter("?internal=true").includeInternal).toBe(false);
    expect(decodeChangelogFilter("?internal").includeInternal).toBe(false);
  });

  it("lee los dos parámetros a la vez e ignora los ajenos", () => {
    expect(decodeChangelogFilter("?utm_source=x&cat=fix&internal=1")).toEqual({
      category: "fix",
      includeInternal: true,
    });
  });
});

describe("encodeChangelogFilter", () => {
  it("el estado por defecto no ensucia la URL", () => {
    expect(encodeChangelogFilter("", DEFAULT_CHANGELOG_FILTER)).toBe("");
  });

  it("escribe categoría e internos", () => {
    expect(encodeChangelogFilter("", { category: "fix", includeInternal: true })).toBe(
      "?cat=fix&internal=1",
    );
  });

  it("borra los parámetros al volver a los valores por defecto", () => {
    expect(
      encodeChangelogFilter("?cat=fix&internal=1", DEFAULT_CHANGELOG_FILTER),
    ).toBe("");
  });

  it("conserva los parámetros ajenos", () => {
    expect(encodeChangelogFilter("?utm_source=x", { category: "fix", includeInternal: false })).toBe(
      "?utm_source=x&cat=fix",
    );
  });

  it("ida y vuelta: lo escrito se vuelve a leer igual", () => {
    for (const filter of [
      DEFAULT_CHANGELOG_FILTER,
      { category: "milestone" as const, includeInternal: false },
      { category: "internal" as const, includeInternal: true },
      { category: "all" as const, includeInternal: true },
    ]) {
      expect(decodeChangelogFilter(encodeChangelogFilter("", filter))).toEqual(filter);
    }
  });
});
