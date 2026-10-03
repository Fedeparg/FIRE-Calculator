import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const { POST } = await import("./route");

const TOKEN = "token-de-prueba";

function post(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new NextRequest(`https://sextante.example${url}`, { method: "POST", headers }));
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.stubEnv("REVALIDATE_TOKEN", TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    revalidatePath.mockClear();
  });

  it("revalidates all content with the token in the header", async () => {
    const res = await post("/api/revalidate", { "x-revalidate-token": TOKEN });

    expect(res.status).toBe(200);
    const patterns = revalidatePath.mock.calls.map(([pattern]) => pattern as string);
    expect(patterns).toEqual(
      expect.arrayContaining(["/[locale]/aprende/[slug]", "/[locale]/legal/[slug]", "/[locale]/novedades"]),
    );
  });

  it("does not accept the token in the query string (it would end up in the access logs)", async () => {
    const res = await post(`/api/revalidate?token=${TOKEN}`);

    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a wrong token", async () => {
    const res = await post("/api/revalidate", { "x-revalidate-token": "otro" });

    expect(res.status).toBe(401);
  });
});
