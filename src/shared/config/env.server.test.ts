import { afterEach, describe, expect, it, vi } from "vitest";

import { serverApiUrl } from "./env.server";

// `server-only` lanza fuera de un servidor de React; en el test basta con neutralizarlo.
vi.mock("server-only", () => ({}));

describe("serverApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve el origen de API_URL", () => {
    vi.stubEnv("API_URL", "http://api:3001/");
    expect(serverApiUrl()).toBe("http://api:3001");
  });

  it("cae a la API local en desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_URL", "");
    expect(serverApiUrl()).toBe("http://localhost:3001");
  });

  it("lanza en producción si falta, en vez de caer en silencio a localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_URL", "");
    expect(() => serverApiUrl()).toThrow(/API_URL es obligatoria/);
  });

  it("no lo exige durante `next build`", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("API_URL", "");
    expect(serverApiUrl()).toBe("http://localhost:3001");
  });

  it("lanza si no es una URL", () => {
    vi.stubEnv("API_URL", "no es una url");
    expect(() => serverApiUrl()).toThrow(/no es una URL válida/);
  });
});
