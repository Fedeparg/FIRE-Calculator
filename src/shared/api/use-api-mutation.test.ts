import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { runApiMutation, type ApiMutationState } from "./use-api-mutation";

function collect() {
  const states: ApiMutationState[] = [];
  return { states, sink: (s: ApiMutationState) => states.push(s) };
}

describe("runApiMutation", () => {
  it("goes pending then success and returns the action's data", async () => {
    const { states, sink } = collect();

    const result = await runApiMutation(async () => 42, sink);

    expect(result).toEqual({ ok: true, data: 42 });
    expect(states).toEqual([{ status: "pending" }, { status: "success" }]);
  });

  it("goes pending then error and returns the error instead of throwing", async () => {
    const { states, sink } = collect();
    const failure = new ApiError(500);

    const result = await runApiMutation(async () => Promise.reject(failure), sink);

    expect(result).toEqual({ ok: false, error: failure });
    expect(states).toEqual([{ status: "pending" }, { status: "error", error: failure }]);
  });

  it("reports pending synchronously, before the action settles", () => {
    const { states, sink } = collect();

    void runApiMutation(() => new Promise<void>(() => undefined), sink);

    expect(states).toEqual([{ status: "pending" }]);
  });
});
