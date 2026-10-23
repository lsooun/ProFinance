import { expect, type Page } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('you@company.com').fill('admin@company.com');
  await page.getByPlaceholder('请输入密码').fill('123456');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
}
