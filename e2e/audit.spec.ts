import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('管理员可以打开审计日志并查看记录详情', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '审计日志' }).click();
  await expect(page.getByRole('heading', { name: '审计日志', level: 2 })).toBeVisible();
  await expect(page.getByText('记录项目、财务、工时、人员和账号的关键变更。')).toBeVisible();
  const detailButton = page.getByRole('button', { name: '查看' }).first();
  if (await detailButton.count()) {
    await detailButton.click();
    await expect(page.getByText('审计记录详情')).toBeVisible();
    await expect(page.getByText('变更前')).toBeVisible();
  }
});
