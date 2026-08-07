// @vitest-environment node
// `getServerEnv()` reads the real `process.env`, so this suite needs the Node
// environment rather than jsdom.
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvValidationError } from "@/lib/env/schema";
import { getServerEnv, resetServerEnvCache } from "@/lib/env/server";

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe("getServerEnv", () => {
  it("returns the validated environment when APP_URL is a valid URL", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");

    expect(getServerEnv().APP_URL).toBe("http://localhost:3000");
  });

  it("rejects an invalid APP_URL when the parser is called", () => {
    vi.stubEnv("APP_URL", "not-a-url");

    expect(() => getServerEnv()).toThrow(EnvValidationError);
  });

  it("rejects a missing APP_URL when the parser is called", () => {
    vi.stubEnv("APP_URL", "");

    expect(() => getServerEnv()).toThrow(EnvValidationError);
  });

  it("memoises the parsed environment across calls", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");

    expect(getServerEnv()).toBe(getServerEnv());
  });

  it("re-reads the environment after the cache is reset", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(getServerEnv().APP_URL).toBe("http://localhost:3000");

    resetServerEnvCache();
    vi.stubEnv("APP_URL", "https://dashboard.example.com");

    expect(getServerEnv().APP_URL).toBe("https://dashboard.example.com");
  });
});
