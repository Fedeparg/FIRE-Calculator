import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  classifyScenariosQuery,
  createScenarioRequest,
  deleteScenarioRequest,
  promoteScenario,
  replaceScenario,
  scenarioErrorKey,
  scenariosListPath,
  updateScenarioRequest,
  type SavedScenario,
} from "./saved-scenarios";

afterEach(() => vi.unstubAllGlobals());

const scenario = (id: string, name = id, updatedAt = "2026-01-01T00:00:00.000Z"): SavedScenario => ({
  id,
  slug: "fire",
  name,
  inputs: {},
  createdAt: updatedAt,
  updatedAt,
});

describe("scenarioErrorKey", () => {
  it("maps the scenario domain codes", () => {
    expect(scenarioErrorKey(new ApiError(400, "INPUTS_TOO_LARGE"))).toBe("errorTooLarge");
    expect(scenarioErrorKey(new ApiError(400, "SCENARIO_QUOTA_EXCEEDED"))).toBe("errorQuota");
  });

  it("falls back to the common mapping", () => {
    expect(scenarioErrorKey(new ApiError(400))).toBe("errorInvalid");
    expect(scenarioErrorKey(new ApiError(400, "OTHER"))).toBe("errorInvalid");
    expect(scenarioErrorKey(new ApiError(401))).toBe("errorSession");
    expect(scenarioErrorKey(new ApiError(503))).toBe("errorServer");
    expect(scenarioErrorKey(new ApiError(404))).toBe("errorGeneric");
    expect(scenarioErrorKey(new ApiError(0))).toBe("errorNetwork");
    expect(scenarioErrorKey(new Error("boom"))).toBe("errorGeneric");
  });
});

describe("classifyScenariosQuery", () => {
  it("distinguishes loading, ready, anonymous and error", () => {
    expect(classifyScenariosQuery({ status: "loading" })).toEqual({ status: "loading", loadError: null });
    expect(classifyScenariosQuery({ status: "ready", data: [] })).toEqual({ status: "ready", loadError: null });
    expect(classifyScenariosQuery({ status: "error", error: new ApiError(401) }).status).toBe("anonymous");
    // Sin respuesta no se afirma que haya sesión.
    expect(classifyScenariosQuery({ status: "error", error: new ApiError(0) }).status).toBe("anonymous");
    expect(classifyScenariosQuery({ status: "error", error: new ApiError(500) })).toEqual({
      status: "error",
      loadError: "errorServer",
    });
  });
});

describe("list helpers", () => {
  it("encodes the slug in the list path", () => {
    expect(scenariosListPath("a b")).toBe("/api/scenarios?slug=a%20b");
  });

  it("promoteScenario moves a scenario first and replaces its old version", () => {
    const list = [scenario("a"), scenario("b"), scenario("c")];
    const updated = scenario("c", "renamed");
    expect(promoteScenario(list, updated)).toEqual([updated, list[0], list[1]]);
    expect(promoteScenario(list, scenario("d")).map((s) => s.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("replaceScenario keeps the position", () => {
    const list = [scenario("a"), scenario("b")];
    const updated = scenario("b", "renamed");
    expect(replaceScenario(list, updated)).toEqual([list[0], updated]);
  });
});

describe("requests", () => {
  it("creates with POST and a JSON body", async () => {
    const fetchMock = vi.fn(async () => Response.json(scenario("n")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createScenarioRequest("fire", "Plan", { a: 1 })).resolves.toMatchObject({ id: "n" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scenarios",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ slug: "fire", name: "Plan", inputs: { a: 1 } }),
      }),
    );
  });

  it("sends an empty PATCH to activate a plan", async () => {
    const fetchMock = vi.fn(async () => Response.json(scenario("x")));
    vi.stubGlobal("fetch", fetchMock);

    await updateScenarioRequest("x", {});

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scenarios/x",
      expect.objectContaining({ method: "PATCH", body: "{}" }),
    );
  });

  it("deletes and tolerates 204", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
    await expect(deleteScenarioRequest("x")).resolves.toBeUndefined();
  });

  it("rejects with the API error code", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: "SCENARIO_QUOTA_EXCEEDED" }, { status: 400 }));
    const failure = await createScenarioRequest("fire", "Plan", {}).catch((e: unknown) => e);
    expect(scenarioErrorKey(failure)).toBe("errorQuota");
  });
});
