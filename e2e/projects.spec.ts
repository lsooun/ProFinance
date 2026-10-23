import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('项目列表使用服务端分页并显示项目卡片', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '项目管理' }).click();
  await expect(page.getByPlaceholder('按项目名称或客户搜索…')).toBeVisible();
  await expect(page.getByText(/共 \d+ 个项目，第 \d+ \/ \d+ 页/)).toBeVisible();
  await expect(page.getByRole('button', { name: /新建项目/ })).toBeVisible();
});
