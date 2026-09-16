import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('renders hero section with title and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Master English');
    await expect(page.locator('h1')).toContainText('Immersive Practice');
    await expect(page.getByText('Get Started Free')).toBeVisible();
    await expect(page.getByText('Start Learning')).toBeVisible();
  });

  test('displays all feature cards', async ({ page }) => {
    await page.goto('/');
    // Use heading role to avoid matching description paragraphs
    await expect(page.getByRole('heading', { name: 'Listen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Speak' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Read' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Write' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI Tutor' })).toBeVisible();
  });

  test('CTA navigates to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Get Started Free').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('nav Start Learning navigates to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav').getByText('Start Learning').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('has StepUp branding in nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav').getByText('StepUp')).toBeVisible();
  });

  test('has footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toContainText('StepUp');
  });

  // 其余用例跑在 playwright.config.ts 预置的"已选择英文"偏好下，这里清掉它
  // 来验证首次访问的默认界面语言。
  test('defaults to Chinese when no language preference is saved', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('echotype_language_settings'));
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('沉浸式练习');
    await expect(page.getByText('免费开始')).toBeVisible();
    await expect(page.getByRole('heading', { name: '听力' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI 导师' })).toBeVisible();
    await expect(page.locator('nav').getByText('小步')).toBeVisible();
  });
});
