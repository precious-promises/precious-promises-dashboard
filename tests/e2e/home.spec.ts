import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("shows the Precious Promises Dashboard heading", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Precious Promises Dashboard",
      }),
    ).toBeVisible();
  });
});
