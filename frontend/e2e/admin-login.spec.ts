import { test, expect } from "@playwright/test";

test.describe("Admin login page", () => {
  test("admin login page loads with heading", async ({ page }) => {
    await page.goto("/admin/login");
    // Page has "Admin Console" heading and "Welcome back, Admin" subheading
    await expect(page.getByRole("heading", { name: "Admin Console" })).toBeVisible();
  });

  test("admin login has email and password fields", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator('input[placeholder="admin@lemontree.org"]')).toBeVisible();
    await expect(page.locator('input[placeholder="••••••••"]')).toBeVisible();
  });

  test("admin login shows error for wrong credentials", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[placeholder="admin@lemontree.org"]').fill("notadmin@example.com");
    await page.locator('input[placeholder="••••••••"]').fill("wrongpass123");
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("text=/invalid|incorrect|error|wrong|failed/i")).toBeVisible({ timeout: 10000 });
  });
});
