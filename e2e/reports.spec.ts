import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('财务报显示项目分类汇总和现金口径', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '统计报表' }).click();
  await expect(page.getByText('总回款')).toBeVisible();
  await expect(page.getByText('总付款')).toBeVisible();
  await expect(page.getByText('项目分类汇总')).toBeVisible();
});
