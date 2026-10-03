import { afterEach, describe, expect, it, vi } from "vitest";

import { serverApiUrl } from "./env.server";

// `server-only` throws outside a React server; in the test it is enough to stub it out.
vi.mock("server-only", () => ({}));

describe("serverApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the origin of API_URL", () => {
    vi.stubEnv("API_URL", "http://api:3001/");
    expect(serverApiUrl()).toBe("http://api:3001");
  });

  it("falls back to the local API in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_URL", "");
    expect(serverApiUrl()).toBe("http://localhost:3001");
  });

  it("throws in production when missing, instead of silently falling back to localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_URL", "");
    expect(() => serverApiUrl()).toThrow(/API_URL is required/);
  });

  it("does not require it during `next build`", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("API_URL", "");
    expect(serverApiUrl()).toBe("http://localhost:3001");
  });

  it("throws when it is not a URL", () => {
    vi.stubEnv("API_URL", "not a url");
    expect(() => serverApiUrl()).toThrow(/is not a valid URL/);
  });
});
