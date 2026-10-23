import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('管理员可以登录并查看主要导航', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
  await expect(page.getByText('累计回款')).toBeVisible();
  await expect(page.getByText('现金净额').first()).toBeVisible();
  for (const label of ['项目管理', '收支管理', '工时管理', '人员管理', '统计报表', '账号管理', '审计日志']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
});
