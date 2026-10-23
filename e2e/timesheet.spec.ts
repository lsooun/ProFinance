import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('工时数值输入整数 8 通过浏览器校验', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '工时管理' }).click();
  await page.getByRole('button', { name: '填报工时' }).click();
  const hours = page.locator('input[type="number"]').first();
  await hours.fill('8');
  await expect(hours).toHaveValue('8');
  expect(await hours.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(true);
});
