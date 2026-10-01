import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { runApiQuery, type ApiQueryState } from "./use-api-query";

afterEach(() => vi.unstubAllGlobals());

function collect() {
  const states: ApiQueryState<{ n: number }>[] = [];
  return { states, sink: (s: ApiQueryState<{ n: number }>) => states.push(s) };
}

describe("runApiQuery", () => {
  it("emits ready with the parsed data and forwards the signal and init", async () => {
    const fetchMock = vi.fn(async () => Response.json({ n: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const { states, sink } = collect();

    await runApiQuery("/api/x", { cache: "no-store" }, controller.signal, sink);

    expect(states).toEqual([{ status: "ready", data: { n: 1 } }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/x", expect.objectContaining({ cache: "no-store", signal: controller.signal }));
  });

  it("emits error with an ApiError on HTTP failure", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: "X" }, { status: 400 }));
    const { states, sink } = collect();

    await runApiQuery("/api/x", undefined, new AbortController().signal, sink);

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ status: "error", error: { status: 400, code: "X" } });
  });

  it("emits a network error when fetch rejects", async () => {
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("offline")));
    const { states, sink } = collect();

    await runApiQuery("/api/x", undefined, new AbortController().signal, sink);

    const state = states[0];
    expect(state.status).toBe("error");
    expect(state.status === "error" && state.error).toBeInstanceOf(ApiError);
    expect(state.status === "error" && state.error.isNetwork).toBe(true);
  });

  it("emits nothing when aborted before the response arrives (success)", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", async () => {
      controller.abort();
      return Response.json({ n: 1 });
    });
    const { states, sink } = collect();

    await runApiQuery("/api/x", undefined, controller.signal, sink);

    expect(states).toEqual([]);
  });

  it("emits nothing when the request is aborted (rejection)", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const { states, sink } = collect();

    await runApiQuery("/api/x", undefined, controller.signal, sink);

    expect(states).toEqual([]);
  });
});
