import { test, expect } from '@playwright/test';
import { login } from './helpers';

const costSheet = {
  updated_at: new Date().toISOString(),
  hardware_contract_with_tax: 0, service_contract_with_tax: 106,
  total_contract_with_tax: 106, hardware_revenue_without_tax: 0,
  service_revenue_without_tax: 100, total_revenue_without_tax: 100,
  hardware_cost: 0, service_cost: 0, outsourcing_cost: 0, manpower_cost: 60,
  other_expense: 10, travel_cost: 0, withholding_tax: 0, total_cost: 70,
  gross_margin: 30, gross_margin_pct: 0.3,
  contingency_outsourcing_pct: 5, contingency_manpower_pct: 5,
  contingency_outsourcing: 0, contingency_manpower: 3, other_risk: 0,
  surcharge_tax_hardware: 0, surcharge_tax_service: 0, service_surcharge_enabled: false,
  financial_interest: 0, approval_margin: 27, approval_margin_pct: 0.27,
};

test('Cost Sheet 创建版本、展示历史和恢复版本', async ({ page }) => {
  await login(page);
  const created = await page.request.post('/api/projects', {
    data: {
      name: `E2E 版本项目 ${Date.now()}`,
      description: '自动化验收',
      status: 'presales',
      category: 'custom_development',
      revenue: 106,
      cost_sheet: costSheet,
    },
  });
  expect(created.status()).toBe(201);
  const project = await created.json();

  try {
    await page.reload();
    await page.goto(`/#/projects/${project.id}`);
    await expect(page.getByText('Cost Sheet 分析')).toBeVisible();
    await expect(page.getByText('关键文档完整性')).toBeVisible();
    await expect(page.getByRole('button', { name: '分配成员' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '新增收支' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '新增回款节点' })).toHaveCount(1);
    await expect(page.getByText('当前版本 v1 · 基线 v1')).toBeVisible();

    const updated = await page.request.patch(`/api/projects/${project.id}`, {
      data: {
        cost_sheet: { ...costSheet, approval_margin: 20, approval_margin_pct: 0.2 },
        cost_sheet_change_reason: 'E2E 调整审批利润',
      },
    });
    expect(updated.status()).toBe(200);
    const updatedProject = await updated.json();
    expect(updatedProject.cost_sheet_version).toBe(2);

    await page.reload();
    await page.goto(`/#/projects/${project.id}`);
    await expect(page.getByText('当前版本 v2 · 基线 v1')).toBeVisible();
    await page.getByRole('button', { name: '历史版本' }).click();
    await expect(page.getByText('Cost Sheet 版本历史')).toBeVisible();
    await expect(page.getByText('E2E 调整审批利润')).toBeVisible();

    await page.getByRole('button', { name: '查看' }).last().click();
    await expect(page.getByText('Cost Sheet 版本 v1')).toBeVisible();
    await expect(page.getByText('基线版本')).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: '恢复为新版本' }).click();
    await expect(page.getByText('当前版本 v3 · 基线 v1')).toBeVisible();
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
