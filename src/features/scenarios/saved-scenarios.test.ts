import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/client";
import {
  activeScenario,
  applyScenarioChange,
  classifyScenariosQuery,
  createScenarioRequest,
  currentScenarios,
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
    // Without a response we do not assume there is a session.
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

describe("local list corrections", () => {
  it("shows the loaded list until an action corrects it", () => {
    const loaded = [scenario("a"), scenario("b")];
    expect(currentScenarios(null, loaded)).toBe(loaded);
    expect(currentScenarios(null, null)).toEqual([]);
  });

  it("applies successive changes on top of the previous correction", () => {
    const loaded = [scenario("a"), scenario("b")];
    const first = applyScenarioChange(null, loaded, (list) => promoteScenario(list, scenario("b", "renamed")));
    expect(currentScenarios(first, loaded).map((s) => s.name)).toEqual(["renamed", "a"]);
    const second = applyScenarioChange(first, loaded, (list) => list.filter((s) => s.id !== "a"));
    expect(currentScenarios(second, loaded).map((s) => s.id)).toEqual(["b"]);
  });

  it("drops the correction when the query returns new data", () => {
    const loaded = [scenario("a")];
    const local = applyScenarioChange(null, loaded, () => []);
    const refetched = [scenario("a"), scenario("z")];
    expect(currentScenarios(local, refetched)).toBe(refetched);
    // A later change starts from the new data, not from the stale correction.
    const next = applyScenarioChange(local, refetched, (list) => [...list]);
    expect(next.list.map((s) => s.id)).toEqual(["a", "z"]);
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

describe("activeScenario", () => {
  const plan = (id: string, updatedAt: string) => ({ id, updatedAt });

  it("returns null when there are no plans", () => {
    expect(activeScenario([])).toBeNull();
  });

  it("picks the most recently updated one, without relying on the list order", () => {
    const plans = [
      plan("a", "2026-09-01T10:00:00.000Z"),
      plan("b", "2026-10-01T09:00:00.000Z"),
      plan("c", "2026-09-30T23:59:59.000Z"),
    ];
    expect(activeScenario(plans)?.id).toBe("b");
  });

  it("keeps the first one in the list when dates are equal", () => {
    const at = "2026-10-01T09:00:00.000Z";
    expect(activeScenario([plan("a", at), plan("b", at)])?.id).toBe("a");
  });
});
