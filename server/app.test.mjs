import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.mjs';

let server;
let app;
let baseUrl;
let tempDir;
let adminCookie;
let managerCookie;
let employeeCookie;

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie');
  return { status: response.status, data, cookie: setCookie ? setCookie.split(';')[0] : null };
}

async function login(email, password = '123456') {
  const result = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(result.status, 200, `login failed for ${email}: ${JSON.stringify(result.data)}`);
  assert.ok(result.cookie, 'expected session cookie');
  return result.cookie;
}

async function createTestPerson(name, emailPrefix) {
  const email = `${emailPrefix}.${Date.now()}.${Math.floor(Math.random() * 10000)}@company.com`;
  const result = await api('/api/persons', {
    method: 'POST',
    cookie: adminCookie,
    body: { name, role: 'other', email, phone: '', department: '测试部', is_active: true },
  });
  assert.equal(result.status, 201, `person create failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

before(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'profinance-test-'));
  app = createApp({
    dbPath: path.join(tempDir, 'test.db'),
    uploadDir: path.join(tempDir, 'uploads'),
    secureCookie: false,
  });
  server = createServer((req, res) => app.handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  adminCookie = await login('admin@company.com');
  managerCookie = await login('manager@company.com');
  employeeCookie = await login('wang.lei@company.com');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  app.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('健康检查可用', async () => {
  const result = await api('/api/health');
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
});

test('登录失败返回 401，登录成功返回会话', async () => {
  const bad = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@company.com', password: 'wrong-password' },
  });
  assert.equal(bad.status, 401);
  assert.equal(typeof bad.data.error, 'string');
  assert.equal(bad.cookie, null);

  const bootstrap = await api('/api/page-data', { cookie: adminCookie });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.data.user.role, 'admin');
  assert.equal(bootstrap.data.projects.length, 3);
  assert.equal(bootstrap.data.persons.length, 6);
  assert.equal(bootstrap.data.transactions.length, 8);
  assert.equal(bootstrap.data.invoicePlans.length, 5);
  assert.equal(bootstrap.data.users.length, 3);
  assert.deepEqual(bootstrap.data.permissions, { canManage: true, isAdmin: true, canViewAllProjectStats: true });
  assert.equal('password_hash' in bootstrap.data.user, false);
  assert.equal(bootstrap.data.managerOptions.length, 1);
  assert.equal(bootstrap.data.managerOptions[0].full_name, '张伟');
});

test('员工只能拿到被分配项目与自己的工时', async () => {
  const result = await api('/api/page-data', { cookie: employeeCookie });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.role, 'employee');
  assert.equal(result.data.projects.length, 1);
  assert.equal(result.data.projects[0].name, '企业官网改版');
  assert.equal(result.data.projects[0].revenue, 0);
  assert.equal(result.data.projects[0].budget_labor, 0);
  assert.equal(result.data.transactions.length, 0);
  assert.equal(result.data.invoicePlans.length, 0);
  assert.equal(result.data.attachments.length, 0);
  assert.equal(result.data.users.length, 0);
  assert.equal(result.data.permissions.canManage, false);
  assert.deepEqual(result.data.managerOptions, []);
  assert.ok(result.data.timesheets.length > 0);
  assert.ok(result.data.timesheets.every((entry) => entry.person_id === result.data.user.person_id));
  assert.ok(
    result.data.assignments.every(
      (assignment) => assignment.person_id === result.data.user.person_id || assignment.planned_hours === 0,
    ),
  );
  assert.ok(result.data.persons.every((person) => person.email === '' && person.phone === ''));
});

test('员工不能创建项目、不能访问管理员用户接口', async () => {
  const createProject = await api('/api/projects', {
    method: 'POST',
    cookie: employeeCookie,
    body: {
      name: '未授权项目',
      status: 'presales',
      description: '',
      manager_user_id: null,
      client: '',
      start_date: null,
      end_date: null,
      budget_labor: 0,
      budget_travel: 0,
      budget_other: 0,
      revenue: 0,
    },
  });
  assert.equal(createProject.status, 403);

  const users = await api('/api/users', { cookie: employeeCookie });
  assert.equal(users.status, 403);

  const usersAsManager = await api('/api/users', { cookie: managerCookie });
  assert.equal(usersAsManager.status, 403);
});

test('员工只能填报自己的工时，且项目必须已分配', async () => {
  const bootstrap = await api('/api/page-data', { cookie: employeeCookie });
  const { user, projects } = bootstrap.data;
  const managerBootstrap = await api('/api/page-data', { cookie: managerCookie });
  const unassignedProject = managerBootstrap.data.projects.find(
    (project) => !projects.some((assigned) => assigned.id === project.id),
  );

  const own = await api('/api/timesheets', {
    method: 'POST',
    cookie: employeeCookie,
    body: {
      project_id: projects[0].id,
      person_id: user.person_id,
      date: '2026-10-01',
      hours: 2,
      description: '测试工时',
    },
  });
  assert.equal(own.status, 201);

  const otherPerson = managerBootstrap.data.persons.find((person) => person.id !== user.person_id);
  const forOther = await api('/api/timesheets', {
    method: 'POST',
    cookie: employeeCookie,
    body: {
      project_id: projects[0].id,
      person_id: otherPerson.id,
      date: '2026-10-01',
      hours: 1,
      description: '越权填报',
    },
  });
  assert.equal(forOther.status, 403);

  const unassigned = await api('/api/timesheets', {
    method: 'POST',
    cookie: employeeCookie,
    body: {
      project_id: unassignedProject.id,
      person_id: user.person_id,
      date: '2026-10-01',
      hours: 1,
      description: '未分配项目',
    },
  });
  assert.equal(unassigned.status, 403);

  const otherEntry = managerBootstrap.data.timesheets.find((entry) => entry.person_id !== user.person_id);
  const forbiddenEdit = await api(`/api/timesheets/${otherEntry.id}`, {
    method: 'PATCH',
    cookie: employeeCookie,
    body: { hours: 1 },
  });
  assert.equal(forbiddenEdit.status, 403);
});

test('项目经理可以创建项目并查看全部数据，但不能管理用户', async () => {
  const before = await api('/api/page-data', { cookie: managerCookie });
  const managerUserId = before.data.user.id;
  const created = await api('/api/projects', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      name: '测试项目',
      description: '集成测试创建',
      status: 'in_progress',
      category: 'custom_development',
      manager_user_id: managerUserId,
      client: '测试客户',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      budget_labor: 1000,
      budget_travel: 200,
      budget_other: 100,
      revenue: 3000,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.name, '测试项目');
  assert.equal(created.data.manager_user_id, managerUserId);
  assert.equal(created.data.manager_name, '张伟');
  assert.equal(created.data.category, 'custom_development');

  const after = await api('/api/page-data', { cookie: managerCookie });
  assert.equal(after.data.projects.length, before.data.projects.length + 1);
  assert.equal(after.data.users.length, 0);

  const deleteResult = await api(`/api/projects/${created.data.id}`, {
    method: 'DELETE',
    cookie: managerCookie,
  });
  assert.equal(deleteResult.status, 200);
});

test('新建项目必须选择合法分类，分类可以修改', async () => {
  const missing = await api('/api/projects', {
    method: 'POST', cookie: managerCookie,
    body: { name: '缺少分类项目', description: '', status: 'presales' },
  });
  assert.equal(missing.status, 400);
  assert.match(missing.data.error, /分类/);

  const invalid = await api('/api/projects', {
    method: 'POST', cookie: managerCookie,
    body: { name: '非法分类项目', description: '', status: 'presales', category: 'invalid_category' },
  });
  assert.equal(invalid.status, 400);

  const created = await api('/api/projects', {
    method: 'POST', cookie: managerCookie,
    body: { name: '分类测试项目', description: '', status: 'presales', category: 'erp_delivery' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.category, 'erp_delivery');

  const patched = await api(`/api/projects/${created.data.id}`, {
    method: 'PATCH', cookie: managerCookie, body: { category: 'integration_implementation' },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.category, 'integration_implementation');

  await api(`/api/projects/${created.data.id}`, { method: 'DELETE', cookie: managerCookie });
});

test('项目经理只能是角色为 manager 的真实用户', async () => {
  const admin = await api('/api/page-data', { cookie: adminCookie });
  const employee = admin.data.users.find((user) => user.role === 'employee');
  const adminUser = admin.data.users.find((user) => user.role === 'admin');

  for (const invalidId of [employee.id, adminUser.id]) {
    const created = await api('/api/projects', {
      method: 'POST',
      cookie: managerCookie,
      body: {
        name: '非法负责人项目',
        description: '',
        status: 'presales',
        category: 'custom_development',
        manager_user_id: invalidId,
        client: '',
        start_date: null,
        end_date: null,
        budget_labor: 0,
        budget_travel: 0,
        budget_other: 0,
        revenue: 0,
      },
    });
    assert.equal(created.status, 400);
    assert.match(created.data.error, /项目经理/);
  }
});

test('项目经理可以修改成员计划工时，员工不能', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const assignment = bootstrap.data.assignments[0];

  const updated = await api(`/api/assignments/${assignment.id}`, {
    method: 'PATCH',
    cookie: managerCookie,
    body: { planned_hours: 123 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.planned_hours, 123);

  const forbidden = await api(`/api/assignments/${assignment.id}`, {
    method: 'PATCH',
    cookie: employeeCookie,
    body: { planned_hours: 99 },
  });
  assert.equal(forbidden.status, 403);

  await api(`/api/assignments/${assignment.id}`, {
    method: 'PATCH',
    cookie: managerCookie,
    body: { planned_hours: assignment.planned_hours },
  });
});

test('回款节点可以编辑日期、节点和比例', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const plan = bootstrap.data.invoicePlans.find((item) => item.percentage === 40);
  assert.ok(plan);

  const updated = await api(`/api/invoices/${plan.id}`, {
    method: 'PATCH',
    cookie: managerCookie,
    body: { date: '2026-10-06', stage: '编辑后的回款节点', percentage: 39 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.date, '2026-10-06');
  assert.equal(updated.data.stage, '编辑后的回款节点');
  assert.equal(updated.data.percentage, 39);

  const restored = await api(`/api/invoices/${plan.id}`, {
    method: 'PATCH',
    cookie: managerCookie,
    body: { date: plan.date, stage: plan.stage, percentage: plan.percentage },
  });
  assert.equal(restored.status, 200);
});

test('用户可以修改自己的资料，管理员可生成一次性重置链接', async () => {
  const stamp = Date.now();
  const email = `profile.${stamp}@company.com`;
  const person = await createTestPerson('资料测试', 'test.person.profile');
  const created = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '资料测试', email, password: '123456', role: 'manager', person_id: person.id },
  });
  assert.equal(created.status, 201);
  const userId = created.data.user.id;
  const userCookie = await login(email);

  const newEmail = `profile.new.${stamp}@company.com`;
  const profile = await api('/api/auth/profile', {
    method: 'PATCH',
    cookie: userCookie,
    body: { full_name: '资料测试改名', email: newEmail },
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.user.full_name, '资料测试改名');
  assert.equal(profile.data.user.email, newEmail);

  const reset = await api(`/api/users/${userId}/reset-token`, {
    method: 'POST',
    cookie: adminCookie,
  });
  assert.equal(reset.status, 201);
  assert.equal(typeof reset.data.token, 'string');

  const resetResult = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { token: reset.data.token, new_password: 'newpass456' },
  });
  assert.equal(resetResult.status, 200);

  const reuse = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { token: reset.data.token, new_password: 'another789' },
  });
  assert.equal(reuse.status, 400);

  const newLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: newEmail, password: 'newpass456' },
  });
  assert.equal(newLogin.status, 200);

  const removed = await api(`/api/users/${userId}`, {
    method: 'DELETE',
    cookie: adminCookie,
  });
  assert.equal(removed.status, 200);
  const personAfter = (await api('/api/page-data', { cookie: adminCookie })).data.persons.find((item) => item.id === person.id);
  assert.equal(personAfter.name, '资料测试改名');
  await api(`/api/persons/${person.id}`, { method: 'DELETE', cookie: adminCookie });
});

test('收支支持预算分类和回款节点关联校验', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const project = bootstrap.data.projects[0];
  const plan = bootstrap.data.invoicePlans.find((item) => item.project_id === project.id);
  assert.ok(plan);

  const expense = await api('/api/transactions', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      type: 'expense',
      category: '差旅',
      description: '预算分类测试',
      amount: 88,
      transaction_date: '2026-10-06',
      project_id: project.id,
      budget_category: 'travel',
      invoice_plan_id: null,
    },
  });
  assert.equal(expense.status, 201);
  assert.equal(expense.data.budget_category, 'travel');

  const income = await api('/api/transactions', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      type: 'income',
      category: '开发服务',
      description: '回款关联测试',
      amount: 100,
      transaction_date: '2026-10-06',
      project_id: project.id,
      invoice_plan_id: plan.id,
    },
  });
  assert.equal(income.status, 201);
  assert.equal(income.data.invoice_plan_id, plan.id);
  assert.equal(income.data.budget_category, null);

  const otherPlan = bootstrap.data.invoicePlans.find((item) => item.project_id !== project.id);
  assert.ok(otherPlan);
  const mismatched = await api('/api/transactions', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      type: 'income',
      category: '开发服务',
      description: '跨项目关联',
      amount: 10,
      transaction_date: '2026-10-06',
      project_id: project.id,
      invoice_plan_id: otherPlan.id,
    },
  });
  assert.equal(mismatched.status, 400);

  const invalidExpense = await api('/api/transactions', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      type: 'expense',
      category: '差旅',
      description: '支出关联回款',
      amount: 10,
      transaction_date: '2026-10-06',
      project_id: project.id,
      invoice_plan_id: plan.id,
    },
  });
  assert.equal(invalidExpense.status, 400);

  await api(`/api/transactions/${expense.data.id}`, { method: 'DELETE', cookie: managerCookie });
  await api(`/api/transactions/${income.data.id}`, { method: 'DELETE', cookie: managerCookie });
});

test('项目经理只能查看自己负责项目的明细，但能看到全部项目统计', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const managerId = bootstrap.data.user.id;
  assert.equal(bootstrap.data.projects.length, 3);
  const ownedIds = new Set(
    bootstrap.data.projects.filter((project) => project.manager_user_id === managerId).map((project) => project.id),
  );
  const unowned = bootstrap.data.projects.find((project) => project.manager_user_id !== managerId);
  assert.ok(unowned);
  assert.ok(bootstrap.data.projects.every((project) => typeof project.aggregate_income === 'number'));
  assert.ok(bootstrap.data.transactions.length > 0);
  assert.ok(bootstrap.data.transactions.every((tx) => tx.project_id && ownedIds.has(tx.project_id)));
  assert.ok(bootstrap.data.timesheets.every((entry) => ownedIds.has(entry.project_id)));
  assert.ok(bootstrap.data.invoicePlans.every((plan) => ownedIds.has(plan.project_id)));
  assert.ok(bootstrap.data.attachments.every((attachment) => ownedIds.has(attachment.project_id)));

  const patch = await api(`/api/projects/${unowned.id}`, {
    method: 'PATCH',
    cookie: managerCookie,
    body: { description: '不应被修改' },
  });
  assert.equal(patch.status, 403);

  const forbiddenTx = await api('/api/transactions', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      type: 'expense', category: '其他', description: '越权测试',
      amount: 1, transaction_date: '2026-10-20', project_id: unowned.id,
    },
  });
  assert.equal(forbiddenTx.status, 403);

  const ownedProject = bootstrap.data.projects.find((project) => ownedIds.has(project.id));
  const allowedTx = await api('/api/transactions', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      type: 'expense', category: '其他', description: '权限内测试',
      amount: 1, transaction_date: '2026-10-20', project_id: ownedProject.id,
    },
  });
  assert.equal(allowedTx.status, 201);
  await api(`/api/transactions/${allowedTx.data.id}`, { method: 'DELETE', cookie: managerCookie });
});

test('工时支持天/周/月/年单位并统一折算为小时存储', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const project = bootstrap.data.projects.find((item) => item.manager_user_id === bootstrap.data.user.id);
  const assignment = bootstrap.data.assignments.find((item) => item.project_id === project.id);
  assert.ok(project && assignment);

  const created = await api('/api/timesheets', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      project_id: project.id,
      person_id: assignment.person_id,
      date: '2026-10-20',
      hours: 2,
      hours_unit: 'day',
      description: '单位折算测试',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.hours, 16);

  const updated = await api(`/api/timesheets/${created.data.id}`, {
    method: 'PATCH',
    cookie: managerCookie,
    body: { hours: 1, hours_unit: 'week' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.hours, 40);

  const invalid = await api('/api/timesheets', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      project_id: project.id,
      person_id: assignment.person_id,
      date: '2026-10-20',
      hours: 1,
      hours_unit: 'century',
    },
  });
  assert.equal(invalid.status, 400);

  await api(`/api/timesheets/${created.data.id}`, { method: 'DELETE', cookie: managerCookie });
});

test('所有角色的用户都可以关联人员档案', async () => {
  const person = await createTestPerson('人员关联测试', 'test.person.link');
  const stamp = Date.now();
  const created = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      full_name: '人员关联经理', email: `person.link.${stamp}@company.com`,
      password: '123456', role: 'manager', person_id: person.id,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.person_id, person.id);

  const updated = await api(`/api/users/${created.data.user.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { role: 'admin', person_id: person.id },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.user.person_id, person.id);

  await api(`/api/users/${created.data.user.id}`, { method: 'DELETE', cookie: adminCookie });
  await api(`/api/persons/${person.id}`, { method: 'DELETE', cookie: adminCookie });
});

test('项目经理和员工账号必须关联唯一人员档案', async () => {
  const person = await createTestPerson('唯一账号测试', 'test.person.unique');
  const noPerson = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '无人员', email: `no.person.${Date.now()}@company.com`, password: '123456', role: 'manager' },
  });
  assert.equal(noPerson.status, 400);
  assert.match(noPerson.data.error, /人员/);

  const email = `unique.account.${Date.now()}@company.com`;
  const created = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '不应覆盖人员姓名', email, password: '123456', role: 'employee', person_id: person.id },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.person_id, person.id);
  assert.equal(created.data.user.full_name, person.name);

  const duplicate = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '重复账号', email: `duplicate.${Date.now()}@company.com`, password: '123456', role: 'employee', person_id: person.id },
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.data.error, /已开通/);

  const renamed = await api(`/api/persons/${person.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: '唯一账号改名' },
  });
  assert.equal(renamed.status, 200);
  const users = (await api('/api/page-data', { cookie: adminCookie })).data.users;
  assert.equal(users.find((u) => u.id === created.data.user.id).full_name, '唯一账号改名');

  await api(`/api/users/${created.data.user.id}`, { method: 'DELETE', cookie: adminCookie });
  await api(`/api/persons/${person.id}`, { method: 'DELETE', cookie: adminCookie });
});

test('项目表不再保留旧 cost_sheet 字段', () => {
  const columns = app.db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name);
  assert.equal(columns.includes('cost_sheet'), false);
  assert.ok(columns.includes('category'));
});

test('项目可以保存 Cost Sheet 计算结果并上传分类文档', async () => {
  const costSheet = {
    source_file_name: 'test.xlsx',
    parsed_at: new Date().toISOString(),
    customer_name: '测试客户',
    project_description: 'Cost Sheet 测试项目',
    project_start_date: '2026-10-01',
    person_days: 10,
    service_contract_with_tax: 106,
    service_revenue_without_tax: 100,
    hardware_contract_with_tax: 0,
    total_contract_with_tax: 106,
    total_revenue_without_tax: 100,
    manpower_cost: 60,
    travel_cost: 5,
    other_expense: 5,
    outsourcing_cost: 0,
    service_cost: 0,
    withholding_tax: 0,
    total_cost: 70,
    gross_margin: 30,
    gross_margin_pct: 0.3,
    contingency_manpower: 3,
    contingency_outsourcing: 0,
    other_risk: 0,
    approval_margin: 27,
    approval_margin_pct: 0.27,
    payment_milestones: [{ stage: '合同签订', percentage: 100, amount: 106, description: '' }],
    warnings: [],
  };
  const created = await api('/api/projects', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      name: 'Cost Sheet 集成测试', description: '', status: 'presales', category: 'custom_development',
      client: '测试客户', budget_labor: 60, budget_travel: 5, budget_other: 5,
      revenue: 106, cost_sheet: costSheet,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.cost_sheet.total_contract_with_tax, 106);
  assert.equal(created.data.cost_sheet.approval_margin, 27);
  assert.equal(created.data.cost_sheet_version, 1);
  assert.equal(created.data.cost_sheet_baseline_version, 1);
  assert.equal(created.data.tax_rate, 6);

  const descriptionOnly = await api(`/api/projects/${created.data.id}`, {
    method: 'PATCH', cookie: managerCookie, body: { description: '只改描述' },
  });
  assert.equal(descriptionOnly.status, 200);
  assert.equal(descriptionOnly.data.cost_sheet_version, 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM project_cost_sheet_versions WHERE project_id = ?').get(created.data.id).n, 1);

  const costSheetUpdate = await api(`/api/projects/${created.data.id}`, {
    method: 'PATCH', cookie: managerCookie,
    body: {
      cost_sheet: { ...costSheet, approval_margin: 20, approval_margin_pct: 0.2 },
      cost_sheet_change_reason: '调整审批利润',
    },
  });
  assert.equal(costSheetUpdate.status, 200);
  assert.equal(costSheetUpdate.data.cost_sheet_version, 2);
  assert.equal(costSheetUpdate.data.cost_sheet_baseline_version, 1);
  assert.equal(costSheetUpdate.data.cost_sheet.approval_margin, 20);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM project_cost_sheet_versions WHERE project_id = ?').get(created.data.id).n, 2);

  const versions = await api(`/api/projects/${created.data.id}/cost-sheet-versions`, { cookie: managerCookie });
  assert.equal(versions.status, 200);
  assert.equal(versions.data.length, 2);
  assert.equal(versions.data[0].version, 2);
  assert.equal(versions.data[0].is_current, true);
  assert.equal(versions.data[1].version, 1);
  assert.equal(versions.data[1].is_baseline, true);
  assert.equal(versions.data[0].change_reason, '调整审批利润');
  assert.equal(versions.data[1].change_reason, '初始版本');

  const versionDetail = await api(`/api/projects/${created.data.id}/cost-sheet-versions/1`, { cookie: managerCookie });
  assert.equal(versionDetail.status, 200);
  assert.equal(versionDetail.data.details.approval_margin, 27);

  const restored = await api(`/api/projects/${created.data.id}/cost-sheet-versions/1/restore`, {
    method: 'POST', cookie: managerCookie, body: { change_reason: '回到初始方案' },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.cost_sheet_version, 3);
  assert.equal(restored.data.cost_sheet.approval_margin, 27);
  const restoredVersions = await api(`/api/projects/${created.data.id}/cost-sheet-versions`, { cookie: managerCookie });
  assert.equal(restoredVersions.data.length, 3);
  assert.equal(restoredVersions.data[0].change_reason, '回到初始方案');

  const employeeVersions = await api(`/api/projects/${created.data.id}/cost-sheet-versions`, { cookie: employeeCookie });
  assert.equal(employeeVersions.status, 403);

  const attachment = await api(`/api/projects/${created.data.id}/attachments`, {
    method: 'POST',
    cookie: managerCookie,
    body: {
      file_name: 'SOW.docx',
      file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_size: 10,
      category: 'sow',
      data_base64: Buffer.from('fake-docx').toString('base64'),
    },
  });
  assert.equal(attachment.status, 201);
  assert.equal(attachment.data.category, 'sow');

  const txCreated = await api('/api/transactions', {
    method: 'POST', cookie: managerCookie,
    body: {
      project_id: created.data.id, type: 'income', category: '开发服务',
      description: '重复检测测试', amount: 10, transaction_date: '2026-10-20',
    },
  });
  assert.equal(txCreated.status, 201);
  const duplicateCheck = await api('/api/transactions/check-duplicates', {
    method: 'POST', cookie: managerCookie,
    body: { rows: [{
      project_id: created.data.id, type: 'income', category: '开发服务',
      description: '重复检测测试', amount: 10, transaction_date: '2026-10-20',
    }] },
  });
  assert.equal(duplicateCheck.status, 200);
  assert.equal(duplicateCheck.data.results[0].duplicate, true);

  const txDeleted = await api(`/api/transactions/${txCreated.data.id}`, {
    method: 'DELETE', cookie: managerCookie, body: { delete_reason: '重复记录' },
  });
  assert.equal(txDeleted.status, 200);
  const txRecycle = await api('/api/recycle-bin?type=transaction', { cookie: adminCookie });
  assert.equal(txRecycle.status, 200);
  assert.ok(txRecycle.data.items.some((item) => item.id === txCreated.data.id && item.delete_reason === '重复记录'));
  const txRestored = await api(`/api/transactions/${txCreated.data.id}/restore`, { method: 'POST', cookie: managerCookie });
  assert.equal(txRestored.status, 200);
  await api(`/api/transactions/${txCreated.data.id}`, {
    method: 'DELETE', cookie: managerCookie, body: { delete_reason: '再次清理' },
  });
  const txPurged = await api(`/api/transactions/${txCreated.data.id}/permanent`, { method: 'DELETE', cookie: adminCookie });
  assert.equal(txPurged.status, 200);

  const deleted = await api(`/api/projects/${created.data.id}`, {
    method: 'DELETE', cookie: managerCookie, body: { delete_reason: '测试清理' },
  });
  assert.equal(deleted.status, 200);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM project_cost_sheet_versions WHERE project_id = ?').get(created.data.id).n, 3);
  assert.ok(app.db.prepare('SELECT deleted_at FROM projects WHERE id = ?').get(created.data.id).deleted_at);

  const recycle = await api('/api/recycle-bin?type=project', { cookie: adminCookie });
  assert.equal(recycle.status, 200);
  assert.ok(recycle.data.items.some((item) => item.id === created.data.id && item.delete_reason === '测试清理'));

  const restoredProject = await api(`/api/projects/${created.data.id}/restore`, { method: 'POST', cookie: managerCookie });
  assert.equal(restoredProject.status, 200);
  assert.equal(restoredProject.data.cost_sheet_version, 3);

  const deletedAgain = await api(`/api/projects/${created.data.id}`, {
    method: 'DELETE', cookie: managerCookie, body: { delete_reason: '最终清理' },
  });
  assert.equal(deletedAgain.status, 200);
  const purged = await api(`/api/projects/${created.data.id}/permanent`, { method: 'DELETE', cookie: adminCookie });
  assert.equal(purged.status, 200);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM project_cost_sheet_versions WHERE project_id = ?').get(created.data.id).n, 0);
});

test('管理员账号可以不关联人员档案', async () => {
  const email = `admin.only.${Date.now()}@company.com`;
  const created = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '独立管理员', email, password: '123456', role: 'admin', person_id: null },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.person_id, null);
  assert.equal(created.data.user.role, 'admin');
  await api(`/api/users/${created.data.user.id}`, { method: 'DELETE', cookie: adminCookie });
});

test('最后一名管理员不能被降级、停用或删除', async () => {
  const me = (await api('/api/page-data', { cookie: adminCookie })).data.user;

  const demote = await api(`/api/users/${me.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { role: 'manager' },
  });
  assert.equal(demote.status, 400);
  assert.match(demote.data.error, /管理员/);

  const deactivate = await api(`/api/users/${me.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { is_active: false },
  });
  assert.equal(deactivate.status, 400);

  const selfDelete = await api(`/api/users/${me.id}`, {
    method: 'DELETE',
    cookie: adminCookie,
  });
  assert.equal(selfDelete.status, 400);
});

test('管理员可以新增用户、重置密码，密码修改生效', async () => {
  const email = `test.user.${Date.now()}@company.com`;
  const person = await createTestPerson('测试用户', 'test.person.user');
  const created = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      full_name: '测试用户',
      email,
      password: '123456',
      role: 'manager',
      person_id: person.id,
    },
  });
  assert.equal(created.status, 201);

  const optionsAfterCreate = await api('/api/page-data', { cookie: adminCookie });
  assert.ok(optionsAfterCreate.data.managerOptions.some((option) => option.full_name === '测试用户'));

  const duplicate = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '重复', email, password: '123456', role: 'manager' },
  });
  assert.equal(duplicate.status, 400);

  const userCookie = await login(email);
  const bootstrap = await api('/api/page-data', { cookie: userCookie });
  assert.equal(bootstrap.data.user.email, email);

  const wrongCurrent = await api('/api/auth/password', {
    method: 'POST',
    cookie: userCookie,
    body: { current_password: 'wrong', new_password: 'newpass123' },
  });
  assert.equal(wrongCurrent.status, 400);

  const changed = await api('/api/auth/password', {
    method: 'POST',
    cookie: userCookie,
    body: { current_password: '123456', new_password: 'newpass123' },
  });
  assert.equal(changed.status, 200);

  const oldLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: '123456' },
  });
  assert.equal(oldLogin.status, 401);

  const newLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'newpass123' },
  });
  assert.equal(newLogin.status, 200);

  const reset = await api(`/api/users/${created.data.user.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { password: 'reset123' },
  });
  assert.equal(reset.status, 200);

  const resetLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'reset123' },
  });
  assert.equal(resetLogin.status, 200);

  const removed = await api(`/api/users/${created.data.user.id}`, {
    method: 'DELETE',
    cookie: adminCookie,
  });
  assert.equal(removed.status, 200);

  const optionsAfterDelete = await api('/api/page-data', { cookie: adminCookie });
  assert.ok(!optionsAfterDelete.data.managerOptions.some((option) => option.full_name === '测试用户'));
  await api(`/api/persons/${person.id}`, { method: 'DELETE', cookie: adminCookie });
});

test('附件上传、下载、删除走服务端存储', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const project = bootstrap.data.projects[0];
  const base64 = Buffer.from('fake-xlsx-content').toString('base64');

  const uploaded = await api(`/api/projects/${project.id}/attachments`, {
    method: 'POST',
    cookie: managerCookie,
    body: {
      file_name: '合同.pdf',
      file_type: 'application/pdf',
      file_size: 16,
      category: 'contract',
      data_base64: base64,
    },
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.file_name, '合同.pdf');
  assert.equal(uploaded.data.category, 'contract');
  assert.equal('storage_path' in uploaded.data, false);
  assert.equal('file_data' in uploaded.data, false);

  const download = await fetch(`${baseUrl}/api/attachments/${uploaded.data.id}/download`, {
    headers: { Cookie: managerCookie },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'fake-xlsx-content');

  const employeeUpload = await api(`/api/projects/${project.id}/attachments`, {
    method: 'POST',
    cookie: employeeCookie,
    body: { file_name: 'x.xlsx', file_type: '', file_size: 1, data_base64: base64 },
  });
  assert.equal(employeeUpload.status, 403);

  const employeeDownload = await api(`/api/attachments/${uploaded.data.id}/download`, {
    cookie: employeeCookie,
  });
  assert.equal(employeeDownload.status, 403);

  const removed = await api(`/api/attachments/${uploaded.data.id}`, {
    method: 'DELETE',
    cookie: managerCookie,
  });
  assert.equal(removed.status, 200);
});

test('受保护资源需要登录', async () => {
  const result = await api('/api/page-data');
  assert.equal(result.status, 401);
});

test('回款比例合计不能超过 100%', async () => {
  const bootstrap = await api('/api/page-data', { cookie: managerCookie });
  const project = bootstrap.data.projects.find((item) => item.name === '企业官网改版');
  const result = await api('/api/invoices', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      project_id: project.id,
      date: '2026-10-01',
      stage: '超额节点',
      percentage: 10,
      status: 'unbilled',
    },
  });
  assert.equal(result.status, 400);
  assert.match(result.data.error, /100%/);
});

test('迁移记录已版本化', () => {
  const rows = app.db.prepare('SELECT id FROM schema_migrations ORDER BY id').all();
  assert.ok(rows.some((row) => row.id === '001_project_manager_user'));
  assert.ok(rows.some((row) => row.id === '008_project_tax_rate'));
});

test('审计日志可查询且仅管理员可访问', async () => {
  const result = await api('/api/audit-logs?page=1&page_size=2', { cookie: adminCookie });
  assert.equal(result.status, 200);
  assert.ok(result.data.total > 0);
  assert.ok(result.data.items.length <= 2);
  assert.ok(result.data.items[0].action);
  assert.ok(result.data.items[0].actor_name);

  const denied = await api('/api/audit-logs', { cookie: managerCookie });
  assert.equal(denied.status, 403);
});

test('收支和工时列表支持服务端分页', async () => {
  const transactions = await api('/api/transactions?page=1&page_size=1', { cookie: managerCookie });
  assert.equal(transactions.status, 200);
  assert.ok(transactions.data.total >= 1);
  assert.ok(transactions.data.items.length <= 1);
  assert.ok(transactions.data.summary.income >= 0);

  const timesheets = await api('/api/timesheets?page=1&page_size=1', { cookie: managerCookie });
  assert.equal(timesheets.status, 200);
  assert.ok(timesheets.data.total >= 1);
  assert.ok(timesheets.data.items.length <= 1);
  assert.ok(timesheets.data.summary.hours >= 0);

  const employeeTransactions = await api('/api/transactions?page=1', { cookie: employeeCookie });
  assert.equal(employeeTransactions.status, 403);
  const employeeBootstrap = await api('/api/page-data', { cookie: employeeCookie });
  const employeePersonId = employeeBootstrap.data.user.person_id;
  const employeeTimesheets = await api('/api/timesheets?page=1&page_size=100', { cookie: employeeCookie });
  assert.equal(employeeTimesheets.status, 200);
  assert.ok(employeeTimesheets.data.items.every((entry) => entry.person_id === employeePersonId));
});

test('项目列表支持服务端分页和筛选', async () => {
  const page = await api('/api/projects?page=1&page_size=2', { cookie: managerCookie });
  assert.equal(page.status, 200);
  assert.ok(page.data.total >= 1);
  assert.ok(page.data.items.length <= 2);
  assert.ok(page.data.summary.contract >= 0);
  assert.ok(page.data.summary.income >= 0);

  const filtered = await api('/api/projects?category=erp_delivery&page_size=100', { cookie: adminCookie });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.data.items.every((project) => project.category === 'erp_delivery'));

  const employee = await api('/api/projects?page_size=100', { cookie: employeeCookie });
  assert.equal(employee.status, 200);
  assert.ok(employee.data.items.every((project) => project.id));
});

test('轻量 bootstrap 不携带业务数据，按需页面接口才加载', async () => {
  const light = await api('/api/bootstrap', { cookie: adminCookie });
  assert.equal(light.status, 200);
  assert.equal(light.data.projects.length, 0);
  assert.equal(light.data.transactions.length, 0);
  assert.equal(light.data.timesheets.length, 0);
  assert.equal(light.data.attachments.length, 0);
  assert.ok(light.data.projectOptions.length >= 1);

  const full = await api('/api/page-data', { cookie: adminCookie });
  assert.equal(full.status, 200);
  assert.ok(full.data.projects.length >= 1);
  assert.ok(full.data.persons.length >= 1);
});

test('按需数据接口可独立加载项目详情、人员和报表', async () => {
  const list = await api('/api/projects?page_size=1', { cookie: managerCookie });
  assert.equal(list.status, 200);
  const projectId = list.data.items[0].id;
  const detail = await api(`/api/projects/${projectId}/detail`, { cookie: managerCookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.data.project.id, projectId);
  assert.ok(Array.isArray(detail.data.transactions));

  const personnel = await api('/api/personnel', { cookie: managerCookie });
  assert.equal(personnel.status, 200);
  assert.ok(Array.isArray(personnel.data.persons));
  assert.ok(Array.isArray(personnel.data.assignments));

  const reports = await api('/api/reports?year=2026&month=9&mode=monthly', { cookie: adminCookie });
  assert.equal(reports.status, 200);
  assert.ok(Array.isArray(reports.data.transactions));
  assert.ok(reports.data.summary.totalIncome >= 0);
});
