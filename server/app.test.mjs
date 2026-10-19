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

  const bootstrap = await api('/api/bootstrap', { cookie: adminCookie });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.data.user.role, 'admin');
  assert.equal(bootstrap.data.projects.length, 3);
  assert.equal(bootstrap.data.persons.length, 6);
  assert.equal(bootstrap.data.transactions.length, 8);
  assert.equal(bootstrap.data.invoicePlans.length, 5);
  assert.equal(bootstrap.data.users.length, 3);
  assert.deepEqual(bootstrap.data.permissions, { canManage: true, isAdmin: true });
  assert.equal('password_hash' in bootstrap.data.user, false);
});

test('员工只能拿到被分配项目与自己的工时', async () => {
  const result = await api('/api/bootstrap', { cookie: employeeCookie });
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
      manager_id: null,
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
  const bootstrap = await api('/api/bootstrap', { cookie: employeeCookie });
  const { user, projects } = bootstrap.data;
  const managerBootstrap = await api('/api/bootstrap', { cookie: managerCookie });
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
  const before = await api('/api/bootstrap', { cookie: managerCookie });
  const created = await api('/api/projects', {
    method: 'POST',
    cookie: managerCookie,
    body: {
      name: '测试项目',
      description: '集成测试创建',
      status: 'in_progress',
      manager_id: null,
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

  const after = await api('/api/bootstrap', { cookie: managerCookie });
  assert.equal(after.data.projects.length, before.data.projects.length + 1);
  assert.equal(after.data.users.length, 0);

  const deleteResult = await api(`/api/projects/${created.data.id}`, {
    method: 'DELETE',
    cookie: managerCookie,
  });
  assert.equal(deleteResult.status, 200);
});

test('最后一名管理员不能被降级、停用或删除', async () => {
  const me = (await api('/api/bootstrap', { cookie: adminCookie })).data.user;

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
  const created = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      full_name: '测试用户',
      email,
      password: '123456',
      role: 'manager',
      person_id: null,
    },
  });
  assert.equal(created.status, 201);

  const duplicate = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { full_name: '重复', email, password: '123456', role: 'manager' },
  });
  assert.equal(duplicate.status, 400);

  const userCookie = await login(email);
  const bootstrap = await api('/api/bootstrap', { cookie: userCookie });
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
});

test('附件上传、下载、删除走服务端存储', async () => {
  const bootstrap = await api('/api/bootstrap', { cookie: managerCookie });
  const project = bootstrap.data.projects[0];
  const base64 = Buffer.from('fake-xlsx-content').toString('base64');

  const uploaded = await api(`/api/projects/${project.id}/attachments`, {
    method: 'POST',
    cookie: managerCookie,
    body: {
      file_name: '成本表.xlsx',
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size: 16,
      data_base64: base64,
    },
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.file_name, '成本表.xlsx');
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
  const result = await api('/api/bootstrap');
  assert.equal(result.status, 401);
});

test('回款比例合计不能超过 100%', async () => {
  const bootstrap = await api('/api/bootstrap', { cookie: managerCookie });
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
