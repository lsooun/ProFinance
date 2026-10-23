import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('收支列表加载服务端分页数据', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '收支管理' }).click();
  await expect(page.getByPlaceholder('搜索收支…')).toBeVisible();
  await expect(page.getByText(/共 \d+ 条，第 \d+ \/ \d+ 页/)).toBeVisible();
  await expect(page.getByText('回款').first()).toBeVisible();
});
