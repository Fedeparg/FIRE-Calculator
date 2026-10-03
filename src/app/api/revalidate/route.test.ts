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

  it("revalida todo el contenido con el token en la cabecera", async () => {
    const res = await post("/api/revalidate", { "x-revalidate-token": TOKEN });

    expect(res.status).toBe(200);
    const patterns = revalidatePath.mock.calls.map(([pattern]) => pattern as string);
    expect(patterns).toEqual(
      expect.arrayContaining(["/[locale]/aprende/[slug]", "/[locale]/legal/[slug]", "/[locale]/novedades"]),
    );
  });

  it("no acepta el token en la query (acabaría en los logs de acceso)", async () => {
    const res = await post(`/api/revalidate?token=${TOKEN}`);

    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rechaza un token incorrecto", async () => {
    const res = await post("/api/revalidate", { "x-revalidate-token": "otro" });

    expect(res.status).toBe(401);
  });
});
