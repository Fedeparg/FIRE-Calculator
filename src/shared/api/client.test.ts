import { afterEach, describe, expect, it, vi } from "vitest";
import { firstItem, itemAt } from "@sextante/core/arrays";

import { ApiError, apiErrorKey, apiFetch, apiJson, createApiErrorMapper } from "./client";

function mockFetch(impl: (path: string, init?: RequestInit) => Promise<Response> | Response) {
  const fn = vi.fn(async (path: string, init?: RequestInit) => impl(path, init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiJson", () => {
  it("parses the JSON body of a 2xx response", async () => {
    mockFetch(() => Response.json({ a: 1 }));
    await expect(apiJson<{ a: number }>("/api/x")).resolves.toEqual({ a: 1 });
  });

  it("returns undefined on 204", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(apiJson<void>("/api/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("serializes the body and sets the JSON content type", async () => {
    const fn = mockFetch(() => Response.json({}));
    await apiJson("/api/x", { method: "POST", body: { n: 2 }, headers: { "X-Test": "1" } });
    const [, init] = firstItem(fn.mock.calls);
    expect(init?.body).toBe('{"n":2}');
    expect(init?.headers).toEqual({ "Content-Type": "application/json", "X-Test": "1" });
    expect(init?.method).toBe("POST");
  });

  it("does not add a content type without body", async () => {
    const fn = mockFetch(() => Response.json({}));
    await apiJson("/api/x");
    expect(itemAt(fn.mock.calls, 0)[1]?.headers).toBeUndefined();
  });

  it("throws ApiError with status and the code of the error body", async () => {
    mockFetch(() => Response.json({ code: "NEGATIVE_QUANTITY" }, { status: 400 }));
    const error = await apiJson("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "NEGATIVE_QUANTITY" });
  });

  it("keeps the raw JSON body of the error", async () => {
    mockFetch(() => Response.json({ code: "DUPLICATE", existing: { id: "p1" } }, { status: 409 }));
    const error = await apiJson("/api/x").catch((e: unknown) => e);
    expect((error as ApiError).body).toEqual({ code: "DUPLICATE", existing: { id: "p1" } });
  });

  it("sends a Blob body untouched, with the caller's content type", async () => {
    const fn = mockFetch(() => Response.json({}));
    const csv = new Blob(["a,b"], { type: "text/csv" });
    await apiJson("/api/x", { method: "POST", body: csv, headers: { "Content-Type": "text/csv" } });
    const [, init] = firstItem(fn.mock.calls);
    expect(init?.body).toBe(csv);
    expect(init?.headers).toEqual({ "Content-Type": "text/csv" });
  });

  it("throws ApiError without code when the error body is not JSON", async () => {
    mockFetch(() => new Response("<html>", { status: 502 }));
    const error = await apiJson("/api/x").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: undefined });
  });

  it("ignores a non-string code", async () => {
    mockFetch(() => Response.json({ code: 42 }, { status: 400 }));
    const error = await apiJson("/api/x").catch((e: unknown) => e);
    expect((error as ApiError).code).toBeUndefined();
  });

  it("maps a rejected fetch to a network ApiError", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await apiJson("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetwork).toBe(true);
    expect((error as ApiError).status).toBe(0);
  });

  it("propagates aborts untouched", async () => {
    const abort = new DOMException("aborted", "AbortError");
    mockFetch(() => Promise.reject(abort));
    await expect(apiJson("/api/x")).rejects.toBe(abort);
  });

  it("treats a 2xx with a non-JSON body as a server error", async () => {
    mockFetch(() => new Response("not json", { status: 200 }));
    await expect(apiJson("/api/x")).rejects.toMatchObject({ status: 500 });
  });
});

describe("apiFetch", () => {
  it("returns the raw response on success", async () => {
    mockFetch(() => new Response("blob", { status: 200 }));
    const res = await apiFetch("/api/x");
    expect(await res.text()).toBe("blob");
  });
});

describe("apiErrorKey", () => {
  it.each([
    [0, "errorNetwork"],
    [401, "errorSession"],
    [400, "errorInvalid"],
    [422, "errorInvalid"],
    [404, "errorGeneric"],
    [409, "errorGeneric"],
    [500, "errorServer"],
    [503, "errorServer"],
  ])("maps status %i to %s", (status, key) => {
    expect(apiErrorKey(new ApiError(status))).toBe(key);
  });

  it("falls back to generic for non-ApiError values", () => {
    expect(apiErrorKey(new Error("boom"))).toBe("errorGeneric");
    expect(apiErrorKey("x")).toBe("errorGeneric");
  });
});

describe("createApiErrorMapper", () => {
  const map = createApiErrorMapper({
    codes: { QUOTA: "errorQuota" },
    statuses: { 404: "errorNotFound", 429: "errorRateLimit" },
    invalidFallback: "errorInvalid",
  });

  it("el código de dominio manda sobre el status", () => {
    expect(map(new ApiError(400, "QUOTA"))).toBe("errorQuota");
    expect(map(new ApiError(404, "QUOTA"))).toBe("errorQuota");
  });

  it("sin código conocido, usa el status propio", () => {
    expect(map(new ApiError(404))).toBe("errorNotFound");
    expect(map(new ApiError(429, "OTRO"))).toBe("errorRateLimit");
  });

  it("no confunde un código con una propiedad del prototipo", () => {
    expect(map(new ApiError(400, "toString"))).toBe("errorInvalid");
  });

  it("el resto cae en el mapeo común", () => {
    expect(map(new ApiError(0))).toBe("errorNetwork");
    expect(map(new ApiError(401))).toBe("errorSession");
    expect(map(new ApiError(503))).toBe("errorServer");
    expect(map(new ApiError(409, "CONFLICT"))).toBe("errorGeneric");
    expect(map(new Error("boom"))).toBe("errorGeneric");
  });

  it("un 400/422 sin código propio se traduce con invalidFallback", () => {
    const noForm = createApiErrorMapper({ invalidFallback: "errorGeneric" });
    expect(map(new ApiError(422))).toBe("errorInvalid");
    expect(noForm(new ApiError(400))).toBe("errorGeneric");
    expect(noForm(new ApiError(400, "OUT_OF_RANGE"))).toBe("errorGeneric");
  });
});
