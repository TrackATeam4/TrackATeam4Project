import { test, expect } from "@playwright/test";

/**
 * These tests verify that protected routes redirect unauthenticated users.
 * No login required — we just check the redirect behaviour.
 */
test.describe("Unauthenticated redirect gates", () => {
  test("/home redirects to /auth when not logged in", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/auth/, { timeout: 8000 });
  });

  test("/home/dashboard redirects to /auth when not logged in", async ({ page }) => {
    await page.goto("/home/dashboard");
    await expect(page).toHaveURL(/\/auth/, { timeout: 8000 });
  });

  test("/admin redirects away when not logged in", async ({ page }) => {
    await page.goto("/admin/home");
    // Should redirect to /admin/login or /auth
    await expect(page).toHaveURL(/\/admin\/login|\/auth/, { timeout: 8000 });
  });

  test("/admin/campaigns redirects away when not logged in", async ({ page }) => {
    await page.goto("/admin/campaigns");
    await expect(page).toHaveURL(/\/admin\/login|\/auth/, { timeout: 8000 });
  });

  test("/admin/users redirects away when not logged in", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/login|\/auth/, { timeout: 8000 });
  });
});
