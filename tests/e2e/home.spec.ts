import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("shows the Precious Promises heading", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Precious Promises" }),
    ).toBeVisible();
    await expect(page.getByText("Content & Growth Dashboard")).toBeVisible();
  });

  test("links to the admin sign-in page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /Admin Sign In/ }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
