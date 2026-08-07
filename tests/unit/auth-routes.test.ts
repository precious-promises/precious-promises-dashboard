// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DASHBOARD_PATH,
  isProtectedPath,
  LOGIN_PATH,
  resolveAuthRedirect,
} from "@/lib/auth/routes";

describe("isProtectedPath", () => {
  it("protects the dashboard and everything beneath it", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
    expect(isProtectedPath("/dashboard/content/123")).toBe(true);
  });

  it("leaves the public surface unprotected", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/api/health")).toBe(false);
  });

  it("does not treat a lookalike prefix as protected", () => {
    // A future public page must not be swept up by a naive startsWith check.
    expect(isProtectedPath("/dashboards")).toBe(false);
    expect(isProtectedPath("/dashboard-preview")).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it("sends an unauthenticated visitor from the dashboard to login", () => {
    expect(resolveAuthRedirect("/dashboard", false)).toBe(LOGIN_PATH);
  });

  it("sends an unauthenticated visitor from a nested dashboard path to login", () => {
    expect(resolveAuthRedirect("/dashboard/settings", false)).toBe(LOGIN_PATH);
  });

  it("lets an authenticated visitor reach the dashboard", () => {
    expect(resolveAuthRedirect("/dashboard", true)).toBeNull();
  });

  it("sends an authenticated visitor away from the login page", () => {
    expect(resolveAuthRedirect("/login", true)).toBe(DASHBOARD_PATH);
  });

  it("lets an unauthenticated visitor reach the login page", () => {
    expect(resolveAuthRedirect("/login", false)).toBeNull();
  });

  it("leaves the public homepage alone in both states", () => {
    expect(resolveAuthRedirect("/", false)).toBeNull();
    expect(resolveAuthRedirect("/", true)).toBeNull();
  });

  it("leaves the health endpoint reachable without a session", () => {
    // Health checks run unauthenticated; redirecting them would break probes.
    expect(resolveAuthRedirect("/api/health", false)).toBeNull();
  });
});
