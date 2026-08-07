import { expect, test } from "@playwright/test";

/**
 * Anonymous-only end-to-end checks.
 *
 * These run against the real application and, when configured, the real
 * Supabase project — but they deliberately need no account, so they work in
 * any environment. Signed-in behaviour is not covered here: there is no test
 * user, and inventing one would mean asserting against a fake.
 */

test.describe("authentication", () => {
  test("redirects an anonymous visitor from the dashboard to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows the sign-in form on the login page", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { level: 1, name: "Precious Promises" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("offers no public sign-up route from the login page", async ({
    page,
  }) => {
    // This is a private, single-owner dashboard. A registration link appearing
    // here would be a regression, not a feature.
    await page.goto("/login");

    await expect(
      page.getByRole("link", { name: /sign up|register|create account/i }),
    ).toHaveCount(0);
  });

  test("redirects an anonymous visitor away from every protected route", async ({
    page,
  }) => {
    // Stage 2 added three more protected routes. Each must be closed to an
    // anonymous visitor, not just the dashboard root.
    for (const path of [
      "/dashboard/content",
      "/dashboard/content/new",
      "/dashboard/media",
    ]) {
      await page.goto(path);
      await expect(page, `${path} must require a session`).toHaveURL(
        /\/login$/,
      );
    }
  });

  test("keeps the health endpoint reachable without a session", async ({
    request,
  }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "precious-promises-dashboard",
    });
  });
});
