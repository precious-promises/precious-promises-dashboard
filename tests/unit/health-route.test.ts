// @vitest-environment node
// The route handler builds a real `Response`, so this suite needs Node's
// globals rather than jsdom's DOM shims.
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("responds with a successful status", async () => {
    const response = await GET();

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("reports status ok for the dashboard service", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "precious-promises-dashboard",
    });
  });

  it("exposes nothing beyond status and service", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(["service", "status"]);
  });
});
