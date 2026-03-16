import { test, expect } from "@playwright/test";

test.describe("Landing / root page", () => {
  test("root page loads without errors", async ({ page }) => {
    await page.goto("/");
    // Should either show landing content or redirect to /auth or /home
    await expect(page).not.toHaveURL("about:blank");
    // No 500 errors
    const response = await page.request.get("/");
    expect(response.status()).toBeLessThan(500);
  });

  test("root page has Lemontree branding or redirects", async ({ page }) => {
    await page.goto("/");
    // Either shows branding text or redirects cleanly
    const url = page.url();
    const hasContent =
      (await page.locator("text=/Lemontree|volunteer|campaign/i").count()) > 0 ||
      url.includes("/auth") ||
      url.includes("/home");
    expect(hasContent).toBeTruthy();
  });
});
