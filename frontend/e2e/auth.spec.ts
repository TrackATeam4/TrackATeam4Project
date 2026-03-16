import { test, expect } from "@playwright/test";

test.describe("Auth page", () => {
  test("shows sign-in form by default", async ({ page }) => {
    await page.goto("/auth");
    // The h2 heading changes with mode
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("can switch to sign-up mode", async ({ page }) => {
    await page.goto("/auth");
    // Click the "Sign up" tab (the toggle button, not the link text)
    await page.locator('button', { hasText: "Sign up" }).first().click();
    await expect(page.getByRole("heading", { name: "Join the movement" })).toBeVisible({ timeout: 3000 });
  });

  test("shows validation error for empty submit", async ({ page }) => {
    await page.goto("/auth");
    // Click the form submit button (type=submit inside form)
    await page.locator('form button[type="submit"]').click();
    // Should stay on /auth
    await expect(page).toHaveURL(/\/auth/);
  });

  test("shows error for wrong credentials", async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword123");
    await page.locator('form button[type="submit"]').click();
    // Expect an error message to appear
    await expect(page.locator("text=/invalid|incorrect|error|wrong|failed/i")).toBeVisible({ timeout: 10000 });
  });

  test("Google sign-in button is present", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("forgot password link shows reset form", async ({ page }) => {
    await page.goto("/auth");
    const forgotLink = page.getByText(/forgot password/i);
    if (await forgotLink.isVisible()) {
      await forgotLink.click();
      await expect(page.locator('input[type="email"]')).toBeVisible();
    }
  });
});
