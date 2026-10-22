import { test } from "@playwright/test";

test("clicks the lasso tool in marimo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /lasso/i }).click();
});
