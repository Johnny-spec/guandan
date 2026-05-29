import { expect, test } from '@playwright/test';

test('首页能加载并显示登录或大厅入口', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Guandan|掼蛋|Teams/i);
  // 页面应至少出现一个交互元素（按钮 / 链接）。
  const interactives = page.locator('button, a, input').first();
  await expect(interactives).toBeVisible({ timeout: 10_000 });
});

test('健康检查：teams-tab 首页 < 5s 响应', async ({ request }) => {
  const t0 = Date.now();
  const r = await request.get('/');
  expect(r.ok()).toBe(true);
  expect(Date.now() - t0).toBeLessThan(5000);
});
