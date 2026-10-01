import { afterEach, describe, expect, it, vi } from "vitest";

import type { Position } from "@sextante/core/portfolio/types";
import { ApiError } from "@/shared/api/client";
import {
  combinePosition,
  deleteLot,
  deletePosition,
  historyPath,
  listPositions,
  positionConflict,
  positionErrorKey,
  pricesPath,
  saveLot,
  savePosition,
  searchInstruments,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

const existing: Position = {
  id: "p1",
  ticker: "AAPL",
  name: null,
  quantity: 2,
  avgPrice: 100,
  broker: "X",
  currency: "USD",
  isDerivative: false,
  createdAt: "2026-10-01T00:00:00.000Z",
};

function stubFetch(response: () => Response) {
  const fn = vi.fn<typeof fetch>(async () => response());
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("paths", () => {
  it("builds the prices path, or null without tickers", () => {
    expect(pricesPath("")).toBeNull();
    expect(pricesPath("AAPL,BTC-USD")).toBe("/api/prices?symbols=AAPL%2CBTC-USD");
  });

  it("encodes the display currency in the history path", () => {
    expect(historyPath(30, "EUR")).toBe("/api/portfolio/history?days=30&display=EUR");
  });
});

describe("positionConflict / positionErrorKey", () => {
  it("reads the three known 409 codes", () => {
    expect(positionConflict(new ApiError(409, "HAS_SALES"))).toEqual({ kind: "hasSales" });
    expect(positionConflict(new ApiError(409, "BROKER_REQUIRED"))).toEqual({ kind: "brokerRequired" });
    expect(positionConflict(new ApiError(409, "DUPLICATE", { body: { code: "DUPLICATE", existing } }))).toEqual({
      kind: "duplicate",
      existing,
    });
  });

  it("ignores a DUPLICATE without the existing position, other statuses and other errors", () => {
    expect(positionConflict(new ApiError(409, "DUPLICATE", { body: { code: "DUPLICATE" } }))).toBeNull();
    expect(positionConflict(new ApiError(409))).toBeNull();
    expect(positionConflict(new ApiError(400, "HAS_SALES"))).toBeNull();
    expect(positionConflict(new Error("boom"))).toBeNull();
  });

  it("maps HAS_SALES to its own message and the rest through the common mapping", () => {
    expect(positionErrorKey(new ApiError(409, "HAS_SALES"))).toBe("errorHasSales");
    expect(positionErrorKey(new ApiError(409))).toBe("errorGeneric");
    expect(positionErrorKey(new ApiError(400))).toBe("errorInvalid");
    expect(positionErrorKey(new ApiError(401))).toBe("errorSession");
    expect(positionErrorKey(new ApiError(0))).toBe("errorNetwork");
  });
});

describe("requests", () => {
  it("creates or edits a position depending on the id", async () => {
    const fn = stubFetch(() => Response.json(existing));
    const payload = { ticker: "AAPL", quantity: 2, avgPrice: 100, currency: "USD" };

    await savePosition(null, payload);
    await savePosition("p1", payload);

    expect(fn).toHaveBeenNthCalledWith(1, "/api/positions", expect.objectContaining({ method: "POST" }));
    expect(fn).toHaveBeenNthCalledWith(2, "/api/positions/p1", expect.objectContaining({ method: "PATCH" }));
  });

  it("surfaces the 409 body so the form can offer to combine", async () => {
    stubFetch(() => Response.json({ code: "DUPLICATE", existing }, { status: 409 }));
    const failure = await savePosition(null, { ticker: "AAPL", quantity: 1, avgPrice: 1, currency: "USD" }).catch(
      (e: unknown) => e,
    );
    expect(positionConflict(failure)).toEqual({ kind: "duplicate", existing });
  });

  it("combines, lists and deletes positions", async () => {
    const fn = stubFetch(() => Response.json([existing]));
    await combinePosition("p1", { quantity: 1, avgPrice: 90, currency: "USD" });
    await listPositions();
    expect(fn).toHaveBeenNthCalledWith(1, "/api/positions/p1/combine", expect.objectContaining({ method: "POST" }));
    expect(fn).toHaveBeenNthCalledWith(2, "/api/positions", expect.objectContaining({ cache: "no-store" }));

    stubFetch(() => new Response(null, { status: 204 }));
    await expect(deletePosition("p1")).resolves.toBeUndefined();
  });

  it("creates, edits and deletes lots", async () => {
    const fn = stubFetch(() => new Response(null, { status: 204 }));
    const lot = { kind: "buy", quantity: 1, price: 1, fees: 0, tradedAt: "2026-09-01" } as const;

    await saveLot("p1", null, lot);
    await saveLot("p1", "l1", lot);
    await deleteLot("p1", "l1");

    expect(fn).toHaveBeenNthCalledWith(1, "/api/positions/p1/lots", expect.objectContaining({ method: "POST" }));
    expect(fn).toHaveBeenNthCalledWith(2, "/api/positions/p1/lots/l1", expect.objectContaining({ method: "PATCH" }));
    expect(fn).toHaveBeenNthCalledWith(3, "/api/positions/p1/lots/l1", expect.objectContaining({ method: "DELETE" }));
  });

  it("searches instruments with the abort signal and returns the results", async () => {
    const fn = stubFetch(() => Response.json({ results: [{ symbol: "AAPL" }] }));
    const controller = new AbortController();

    await expect(searchInstruments("apple pie", controller.signal)).resolves.toEqual([{ symbol: "AAPL" }]);

    expect(fn).toHaveBeenCalledWith(
      "/api/instruments/search?q=apple%20pie",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("lets an aborted search reject with the AbortError untouched", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", () => Promise.reject(abort));
    await expect(searchInstruments("apple", new AbortController().signal)).rejects.toBe(abort);
  });
});
