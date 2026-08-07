import { expect, test } from "@playwright/test";

/**
 * Public visual smoke checks.
 *
 * These cover only what an anonymous visitor can reach. The authenticated
 * shell — sidebar, mobile drawer, dashboard cards — cannot be exercised here
 * without a real signed-in session, and no owner account exists yet. That
 * coverage is deferred rather than faked; see docs/stage-1-ui.md.
 */

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

test.describe("public pages render without overflow", () => {
  for (const [name, viewport] of [
    ["mobile", MOBILE],
    ["desktop", DESKTOP],
  ] as const) {
    test(`homepage fits the ${name} viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(
        page.getByRole("heading", { level: 1, name: "Precious Promises" }),
      ).toBeVisible();

      // A page that scrolls sideways is the classic "desktop shrunk onto a
      // phone" failure, so assert against it rather than eyeballing it.
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });

    test(`login page fits the ${name} viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/login");

      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }
});

test.describe("login layout adapts rather than shrinking", () => {
  test("hides the brand panel on mobile and shows it on desktop", async ({
    page,
  }) => {
    const brandCopy = page.getByText(
      "Content, production and growth in one place.",
    );

    await page.setViewportSize(MOBILE);
    await page.goto("/login");
    await expect(brandCopy).toBeHidden();

    await page.setViewportSize(DESKTOP);
    await expect(brandCopy).toBeVisible();
  });
});

test.describe("keyboard access", () => {
  test("exposes a skip link as the first tab stop", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeFocused();
  });
});
