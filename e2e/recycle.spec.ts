import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('删除项目进入回收站并可恢复', async ({ page }) => {
  await login(page);
  const name = `E2E 回收站项目 ${Date.now()}`;
  const created = await page.request.post('/api/projects', {
    data: { name, status: 'presales', category: 'other', revenue: 0 },
  });
  expect(created.status()).toBe(201);
  const project = await created.json();

  await page.request.delete(`/api/projects/${project.id}`, { data: { delete_reason: 'E2E 删除' } });

  try {
    await page.getByRole('button', { name: '回收站' }).click();
    await expect(page.getByRole('heading', { name: '回收站', level: 2 })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('E2E 删除');
    await row.getByRole('button', { name: '恢复' }).click();
    await expect(row).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`, { data: { delete_reason: 'E2E 清理' } });
    await page.request.delete(`/api/projects/${project.id}/permanent`);
  }
});
