import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, hashPassword, verifyPassword, nowISO } from './db.mjs';

const SESSION_COOKIE = 'pf_session';
const SESSION_DAYS = 7;
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const PROJECT_STATUSES = ['presales', 'in_progress', 'completed', 'cancelled'];
const PERSON_ROLES = ['project_manager', 'consultant', 'developer', 'designer', 'qa', 'other'];
const USER_ROLES = ['admin', 'manager', 'employee'];
const TRANSACTION_TYPES = ['income', 'expense'];
const INVOICE_STATUSES = ['unbilled', 'invoiced', 'collected'];
const BUDGET_CATEGORIES = ['labor', 'travel', 'other'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const boolInt = (value) => (value ? 1 : 0);

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    is_active: !!row.is_active,
    person_id: row.person_id ?? null,
    created_at: row.created_at,
  };
}

function mapPerson(row) {
  return { ...row, is_active: !!row.is_active };
}

function mapAttachment(row) {
  const { storage_path: _storagePath, ...rest } = row;
  return rest;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new HttpError(413, '请求内容过大，单个文件不能超过 5 MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, '请求格式不正确'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function requiredString(value, label, { max = 500 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${label}不能为空`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function optionalString(value, { max = 5000 } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, '参数格式不正确');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `内容不能超过 ${max} 个字符`);
  return trimmed;
}

function requiredNumber(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) throw new HttpError(400, `${label}必须是数字`);
  if (num < min || num > max) throw new HttpError(400, `${label}超出允许范围`);
  return num;
}

function optionalNumber(value, label, options = {}) {
  if (value === undefined || value === null || value === '') return 0;
  return requiredNumber(value, label, options);
}

function requiredDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${label}格式应为 YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label}不是有效日期`);
  }
  return value;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return requiredDate(value, label);
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createApp({
  dbPath = path.resolve('data/profinance.db'),
  uploadDir = path.resolve('data/uploads'),
  secureCookie = false,
} = {}) {
  const db = openDatabase(dbPath);
  fs.mkdirSync(uploadDir, { recursive: true });

  const rowById = (table, id) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new HttpError(404, '记录不存在');
    return row;
  };

  const projectWithManager = (id) => {
    const row = db.prepare(
      `SELECT p.*, u.full_name AS manager_name
       FROM projects p
       LEFT JOIN users u ON u.id = p.manager_user_id
       WHERE p.id = ?`
    ).get(id);
    if (!row) throw new HttpError(404, '项目不存在');
    return row;
  };

  const userById = (id) => {
    const row = db.prepare(
      'SELECT id, email, full_name, role, is_active, person_id, created_at FROM users WHERE id = ?'
    ).get(id);
    if (!row) throw new HttpError(404, '用户不存在');
    return row;
  };

  const updateRow = (table, id, fields) => {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw new HttpError(400, '没有需要更新的内容');
    const sql = `UPDATE ${table} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...entries.map(([, value]) => value), id);
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  };

  function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
    ).run(sha256(token), userId, expires, nowISO());
    return { token, expires };
  }

  function sessionCookie(token, expires) {
    const attrs = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 1000))}`,
    ];
    if (secureCookie) attrs.push('Secure');
    return attrs.join('; ');
  }

  function clearSessionCookie() {
    const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (secureCookie) attrs.push('Secure');
    return attrs.join('; ');
  }

  function currentUser(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = sha256(token);
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
    if (!session) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    const row = db.prepare(
      'SELECT id, email, full_name, role, is_active, person_id, created_at FROM users WHERE id = ?'
    ).get(session.user_id);
    if (!row || !row.is_active) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    return publicUser(row);
  }

  function requireAuth(req) {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, '请先登录');
    return user;
  }

  function requireManager(user) {
    if (user.role !== 'admin' && user.role !== 'manager') {
      throw new HttpError(403, '没有执行此操作的权限');
    }
  }

  function requireAdmin(user) {
    if (user.role !== 'admin') throw new HttpError(403, '仅管理员可以执行此操作');
  }

  function ensureProjectAccess(user, projectId) {
    if (user.role !== 'employee') return;
    if (!user.person_id) throw new HttpError(403, '当前账号未关联人员档案');
    const assignment = db.prepare(
      'SELECT id FROM project_assignments WHERE project_id = ? AND person_id = ?'
    ).get(projectId, user.person_id);
    if (!assignment) throw new HttpError(403, '无权访问该项目');
  }

  function buildBootstrap(user) {
    const allPersons = db.prepare('SELECT * FROM persons ORDER BY name COLLATE NOCASE').all().map(mapPerson);
    const allAssignments = db.prepare('SELECT * FROM project_assignments').all();
    const allTimesheets = db.prepare('SELECT * FROM timesheets ORDER BY date DESC').all();
    const allProjects = db.prepare(
      `SELECT p.*, u.full_name AS manager_name
       FROM projects p
       LEFT JOIN users u ON u.id = p.manager_user_id
       ORDER BY p.created_at DESC`
    ).all();
    const allTransactions = db.prepare('SELECT * FROM transactions ORDER BY transaction_date DESC').all();
    const allInvoices = db.prepare('SELECT * FROM invoice_plans ORDER BY date ASC').all();
    const allAttachments = db.prepare('SELECT * FROM attachments ORDER BY created_at DESC').all().map(mapAttachment);

    if (user.role === 'employee') {
      const projectIds = new Set(
        allAssignments.filter((a) => a.person_id === user.person_id).map((a) => a.project_id)
      );
      const projects = allProjects.filter((p) => projectIds.has(p.id)).map((p) => ({
        ...p,
        budget_labor: 0,
        budget_travel: 0,
        budget_other: 0,
        revenue: 0,
      }));
      const scopedAssignments = allAssignments
        .filter((a) => projectIds.has(a.project_id))
        .map((a) => (a.person_id === user.person_id ? a : { ...a, planned_hours: 0 }));
      const personIds = new Set(scopedAssignments.map((a) => a.person_id));
      if (user.person_id) personIds.add(user.person_id);
      return {
        user,
        projects,
        persons: allPersons
          .filter((p) => personIds.has(p.id))
          .map((p) => ({ ...p, email: '', phone: '' })),
        assignments: scopedAssignments,
        timesheets: allTimesheets.filter((t) => t.person_id === user.person_id),
        transactions: [],
        invoicePlans: [],
        attachments: [],
        users: [],
        managerOptions: [],
        permissions: { canManage: false, isAdmin: false },
      };
    }

    let users = [];
    if (user.role === 'admin') {
      users = db.prepare(
        'SELECT id, email, full_name, role, is_active, person_id, created_at FROM users ORDER BY created_at ASC'
      ).all().map(publicUser);
    }

    const managerOptions = db.prepare(
      `SELECT id, full_name, role
       FROM users
       WHERE role = 'manager' AND is_active = 1
       ORDER BY full_name COLLATE NOCASE`
    ).all();

    return {
      user,
      projects: allProjects,
      persons: allPersons,
      assignments: allAssignments,
      timesheets: allTimesheets,
      transactions: allTransactions,
      invoicePlans: allInvoices,
      attachments: allAttachments,
      users,
      managerOptions,
      permissions: { canManage: true, isAdmin: user.role === 'admin' },
    };
  }

  async function login(req, res) {
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const row = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, '邮箱或密码错误');
    }
    if (!row.is_active) throw new HttpError(403, '该账号已停用，请联系管理员');
    const { token, expires } = createSession(row.id);
    res.setHeader('Set-Cookie', sessionCookie(token, expires));
    sendJson(res, 200, { user: publicUser(row) });
  }

  async function logout(req, res) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    res.setHeader('Set-Cookie', clearSessionCookie());
    sendJson(res, 200, { ok: true });
  }

  async function updateOwnProfile(req, res) {
    const user = requireAuth(req);
    const body = await readJson(req);
    const fields = {};
    if (body.full_name !== undefined) fields.full_name = requiredString(body.full_name, '姓名', { max: 80 });
    if (body.email !== undefined) {
      const email = requiredString(body.email, '邮箱', { max: 200 }).toLowerCase();
      if (!validEmail(email)) throw new HttpError(400, '邮箱格式不正确');
      const conflict = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?').get(email, user.id);
      if (conflict) throw new HttpError(400, '该邮箱已被使用');
      fields.email = email;
    }
    if (Object.keys(fields).length === 0) throw new HttpError(400, '没有需要更新的内容');
    const updated = updateRow('users', user.id, fields);
    sendJson(res, 200, { user: publicUser(updated) });
  }

  async function resetPasswordWithToken(req, res) {
    const body = await readJson(req);
    const token = typeof body.token === 'string' ? body.token : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    if (!token || newPassword.length < 6) throw new HttpError(400, '重置链接无效或密码不符合要求');
    const reset = db.prepare(
      'SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL'
    ).get(sha256(token));
    if (!reset || new Date(reset.expires_at).getTime() < Date.now()) {
      throw new HttpError(400, '重置链接无效或已过期');
    }
    const account = db.prepare('SELECT * FROM users WHERE id = ?').get(reset.user_id);
    if (!account || !account.is_active) throw new HttpError(400, '重置链接无效或账号已停用');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), account.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(account.id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(nowISO(), sha256(token));
    sendJson(res, 200, { ok: true });
  }

  async function changeOwnPassword(req, res) {
    const user = requireAuth(req);
    const body = await readJson(req);
    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      throw new HttpError(400, '当前密码不正确');
    }
    if (newPassword.length < 6) throw new HttpError(400, '新密码至少需要 6 个字符');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, sha256(token));
    }
    sendJson(res, 200, { ok: true });
  }

  function parseProject(body, { partial = false } = {}) {
    const out = {};
    const has = (key) => !partial || body[key] !== undefined;
    if (has('name')) out.name = requiredString(body.name, '项目名称', { max: 120 });
    if (has('description')) out.description = optionalString(body.description, { max: 5000 });
    if (has('status')) {
      if (!PROJECT_STATUSES.includes(body.status)) throw new HttpError(400, '项目状态无效');
      out.status = body.status;
    }
    if (has('manager_user_id')) {
      if (body.manager_user_id) {
        const manager = db.prepare('SELECT id, role FROM users WHERE id = ?').get(body.manager_user_id);
        if (!manager) throw new HttpError(400, '项目经理账号不存在');
        if (manager.role !== 'manager') {
          throw new HttpError(400, '项目经理必须是角色为“项目经理”的用户账号');
        }
        out.manager_user_id = body.manager_user_id;
      } else {
        out.manager_user_id = null;
      }
    }
    if (has('client')) out.client = optionalString(body.client, { max: 200 });
    if (has('start_date')) out.start_date = optionalDate(body.start_date, '开始日期');
    if (has('end_date')) out.end_date = optionalDate(body.end_date, '结束日期');
    if (has('budget_labor')) out.budget_labor = optionalNumber(body.budget_labor, '人力预算');
    if (has('budget_travel')) out.budget_travel = optionalNumber(body.budget_travel, '差旅预算');
    if (has('budget_other')) out.budget_other = optionalNumber(body.budget_other, '其他预算');
    if (has('revenue')) out.revenue = optionalNumber(body.revenue, '合同收入');
    return out;
  }

  function parseTransaction(body, { partial = false } = {}) {
    const out = {};
    const has = (key) => !partial || body[key] !== undefined;
    if (has('type')) {
      if (!TRANSACTION_TYPES.includes(body.type)) throw new HttpError(400, '收支类型无效');
      out.type = body.type;
    }
    if (has('category')) out.category = requiredString(body.category, '分类', { max: 80 });
    if (has('description')) out.description = optionalString(body.description, { max: 2000 });
    if (has('amount')) out.amount = requiredNumber(body.amount, '金额', { min: 0.01 });
    if (has('transaction_date')) out.transaction_date = requiredDate(body.transaction_date, '交易日期');
    if (has('project_id')) {
      if (body.project_id) {
        rowById('projects', body.project_id);
        out.project_id = body.project_id;
      } else {
        out.project_id = null;
      }
    }
    if (body.budget_category !== undefined) {
      if (body.budget_category !== null && !BUDGET_CATEGORIES.includes(body.budget_category)) {
        throw new HttpError(400, '预算分类无效');
      }
      out.budget_category = body.budget_category ?? null;
    }
    if (body.invoice_plan_id !== undefined) {
      out.invoice_plan_id = body.invoice_plan_id || null;
    }
    return out;
  }

  function defaultBudgetCategory(category) {
    if (category === '工资' || category === 'Salary') return 'labor';
    if (category === '差旅' || category === 'Travel') return 'travel';
    return 'other';
  }

  function normalizeTransactionLinks({ type, projectId, category, budgetCategory, invoicePlanId }) {
    if (type === 'income') {
      if (!invoicePlanId) return { budget_category: null, invoice_plan_id: null };
      if (!projectId) throw new HttpError(400, '关联回款节点前请先选择项目');
      const plan = db.prepare('SELECT id, project_id FROM invoice_plans WHERE id = ?').get(invoicePlanId);
      if (!plan) throw new HttpError(400, '关联的回款节点不存在');
      if (plan.project_id !== projectId) throw new HttpError(400, '回款节点与收入所属项目不一致');
      return { budget_category: null, invoice_plan_id: invoicePlanId };
    }
    if (invoicePlanId) throw new HttpError(400, '只有收入记录可以关联回款节点');
    const budget = budgetCategory || defaultBudgetCategory(category);
    if (!BUDGET_CATEGORIES.includes(budget)) throw new HttpError(400, '预算分类无效');
    return { budget_category: budget, invoice_plan_id: null };
  }

  function parsePerson(body, { partial = false } = {}) {
    const out = {};
    const has = (key) => !partial || body[key] !== undefined;
    if (has('name')) out.name = requiredString(body.name, '姓名', { max: 80 });
    if (has('role')) {
      if (!PERSON_ROLES.includes(body.role)) throw new HttpError(400, '人员角色无效');
      out.role = body.role;
    }
    if (has('email')) out.email = optionalString(body.email, { max: 200 });
    if (has('phone')) out.phone = optionalString(body.phone, { max: 60 });
    if (has('department')) out.department = optionalString(body.department, { max: 120 });
    if (has('is_active')) out.is_active = boolInt(body.is_active);
    return out;
  }

  function parseTimesheet(body, user, { partial = false, existing = null } = {}) {
    const out = {};
    const has = (key) => !partial || body[key] !== undefined;
    if (has('project_id')) {
      const projectId = requiredString(body.project_id, '项目');
      rowById('projects', projectId);
      out.project_id = projectId;
    }
    if (has('person_id')) {
      const personId = requiredString(body.person_id, '人员');
      rowById('persons', personId);
      if (user.role === 'employee') {
        if (!user.person_id || personId !== user.person_id) {
          throw new HttpError(403, '只能为自己填报工时');
        }
      }
      out.person_id = personId;
    }
    if (has('date')) out.date = requiredDate(body.date, '日期');
    if (has('hours')) out.hours = requiredNumber(body.hours, '工时', { min: 0.25, max: 24 });
    if (has('description')) out.description = optionalString(body.description, { max: 1000 });

    if (user.role === 'employee') {
      const projectId = out.project_id ?? existing?.project_id;
      if (!projectId) throw new HttpError(400, '项目不能为空');
      ensureProjectAccess(user, projectId);
      if (existing && existing.person_id !== user.person_id) {
        throw new HttpError(403, '只能修改自己的工时记录');
      }
      if (!has('person_id') && !existing) out.person_id = user.person_id;
    }
    if (!partial) {
      if (!out.project_id) throw new HttpError(400, '项目不能为空');
      if (!out.person_id) throw new HttpError(400, '人员不能为空');
    }
    return out;
  }

  async function handleApi(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method = req.method || 'GET';

    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, { ok: true, time: nowISO() });
      return true;
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      await login(req, res);
      return true;
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      await logout(req, res);
      return true;
    }
    if (pathname === '/api/auth/password' && method === 'POST') {
      await changeOwnPassword(req, res);
      return true;
    }
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      await resetPasswordWithToken(req, res);
      return true;
    }

    const user = requireAuth(req);

    if (pathname === '/api/auth/profile' && method === 'PATCH') {
      await updateOwnProfile(req, res);
      return true;
    }

    if (pathname === '/api/bootstrap' && method === 'GET') {
      sendJson(res, 200, buildBootstrap(user));
      return true;
    }

    if (pathname === '/api/users' && method === 'GET') {
      requireAdmin(user);
      const users = db.prepare(
        'SELECT id, email, full_name, role, is_active, person_id, created_at FROM users ORDER BY created_at ASC'
      ).all().map(publicUser);
      sendJson(res, 200, users);
      return true;
    }

    if (pathname === '/api/users' && method === 'POST') {
      requireAdmin(user);
      const body = await readJson(req);
      const email = requiredString(body.email, '邮箱', { max: 200 }).toLowerCase();
      if (!validEmail(email)) throw new HttpError(400, '邮箱格式不正确');
      if (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email)) {
        throw new HttpError(400, '该邮箱已被使用');
      }
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 6) throw new HttpError(400, '密码至少需要 6 个字符');
      if (!USER_ROLES.includes(body.role)) throw new HttpError(400, '用户角色无效');
      let personId = null;
      if (body.person_id) {
        rowById('persons', body.person_id);
        personId = body.person_id;
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO users (id, email, password_hash, full_name, role, is_active, person_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, email, hashPassword(password), requiredString(body.full_name, '姓名', { max: 80 }),
        body.role, boolInt(body.is_active !== false), personId, nowISO()
      );
      sendJson(res, 201, { user: publicUser(userById(id)) });
      return true;
    }

    let match = pathname.match(/^\/api\/users\/([^/]+)\/reset-token$/);
    if (match && method === 'POST') {
      requireAdmin(user);
      const target = userById(match[1]);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      db.prepare('DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL').run(nowISO());
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(target.id);
      db.prepare(
        'INSERT INTO password_resets (token_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)'
      ).run(sha256(token), target.id, expiresAt, nowISO());
      sendJson(res, 201, { token, expires_at: expiresAt });
      return true;
    }

    match = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (match && method === 'PATCH') {
      requireAdmin(user);
      const id = match[1];
      const target = userById(id);
      const body = await readJson(req);
      const fields = {};
      if (body.full_name !== undefined) fields.full_name = requiredString(body.full_name, '姓名', { max: 80 });
      if (body.email !== undefined) {
        const email = requiredString(body.email, '邮箱', { max: 200 }).toLowerCase();
        if (!validEmail(email)) throw new HttpError(400, '邮箱格式不正确');
        const conflict = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?').get(email, id);
        if (conflict) throw new HttpError(400, '该邮箱已被使用');
        fields.email = email;
      }
      if (body.role !== undefined) {
        if (!USER_ROLES.includes(body.role)) throw new HttpError(400, '用户角色无效');
        fields.role = body.role;
      }
      if (body.is_active !== undefined) fields.is_active = boolInt(body.is_active);
      if (body.person_id !== undefined) {
        if (body.person_id) {
          rowById('persons', body.person_id);
          fields.person_id = body.person_id;
        } else {
          fields.person_id = null;
        }
      }
      if (body.password) {
        if (String(body.password).length < 6) throw new HttpError(400, '密码至少需要 6 个字符');
        fields.password_hash = hashPassword(String(body.password));
      }

      const nextRole = fields.role ?? target.role;
      const nextActive = fields.is_active ?? target.is_active;
      const removesActiveAdmin = target.role === 'admin' && !!target.is_active &&
        (nextRole !== 'admin' || !nextActive);
      if (removesActiveAdmin) {
        const activeAdmins = db.prepare(
          'SELECT COUNT(*) AS count FROM users WHERE role = ? AND is_active = 1 AND id <> ?'
        ).get('admin', id).count;
        if (activeAdmins === 0) throw new HttpError(400, '系统必须至少保留一个启用的管理员');
      }
      if (id === user.id && fields.is_active !== undefined && !fields.is_active) {
        throw new HttpError(400, '不能停用当前登录账号');
      }
      const updated = updateRow('users', id, fields);
      if (fields.password_hash && id !== user.id) {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      }
      sendJson(res, 200, { user: publicUser(updated) });
      return true;
    }

    if (match && method === 'DELETE') {
      requireAdmin(user);
      const id = match[1];
      if (id === user.id) throw new HttpError(400, '不能删除当前登录账号');
      const target = userById(id);
      if (target.role === 'admin' && target.is_active) {
        const otherAdmins = db.prepare(
          'SELECT COUNT(*) AS count FROM users WHERE role = ? AND is_active = 1 AND id <> ?'
        ).get('admin', id).count;
        if (otherAdmins === 0) throw new HttpError(400, '系统必须至少保留一个启用的管理员');
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/projects' && method === 'POST') {
      requireManager(user);
      const body = await readJson(req);
      const fields = parseProject(body);
      const id = randomUUID();
      const now = nowISO();
      db.prepare(
        `INSERT INTO projects (id, name, description, status, manager_user_id, client, start_date, end_date,
          budget_labor, budget_travel, budget_other, revenue, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, fields.name, fields.description ?? '', fields.status ?? 'presales', fields.manager_user_id ?? null,
        fields.client ?? '', fields.start_date ?? null, fields.end_date ?? null,
        fields.budget_labor ?? 0, fields.budget_travel ?? 0, fields.budget_other ?? 0,
        fields.revenue ?? 0, now, now
      );
      sendJson(res, 201, projectWithManager(id));
      return true;
    }

    match = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (match && method === 'PATCH') {
      requireManager(user);
      const id = match[1];
      rowById('projects', id);
      const fields = parseProject(await readJson(req), { partial: true });
      fields.updated_at = nowISO();
      updateRow('projects', id, fields);
      sendJson(res, 200, projectWithManager(id));
      return true;
    }
    if (match && method === 'DELETE') {
      requireManager(user);
      const id = match[1];
      rowById('projects', id);
      const files = db.prepare('SELECT storage_path FROM attachments WHERE project_id = ?').all(id);
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE transactions SET project_id = NULL, invoice_plan_id = NULL WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      for (const file of files) {
        try { fs.unlinkSync(path.join(uploadDir, file.storage_path)); } catch { /* ignore missing file */ }
      }
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/transactions' && method === 'POST') {
      requireManager(user);
      const body = await readJson(req);
      const fields = parseTransaction(body);
      const normalized = normalizeTransactionLinks({
        type: fields.type,
        projectId: fields.project_id ?? null,
        category: fields.category,
        budgetCategory: fields.budget_category,
        invoicePlanId: fields.invoice_plan_id,
      });
      fields.budget_category = normalized.budget_category;
      fields.invoice_plan_id = normalized.invoice_plan_id;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO transactions (id, project_id, type, category, description, amount, transaction_date, created_by, budget_category, invoice_plan_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, fields.project_id ?? null, fields.type, fields.category, fields.description ?? '',
        fields.amount, fields.transaction_date, user.id, fields.budget_category, fields.invoice_plan_id, nowISO()
      );
      sendJson(res, 201, rowById('transactions', id));
      return true;
    }

    match = pathname.match(/^\/api\/transactions\/([^/]+)$/);
    if (match && method === 'PATCH') {
      requireManager(user);
      const id = match[1];
      const existing = rowById('transactions', id);
      const fields = parseTransaction(await readJson(req), { partial: true });
      const nextType = fields.type ?? existing.type;
      const nextProjectId = fields.project_id !== undefined ? fields.project_id : existing.project_id;
      const nextCategory = fields.category ?? existing.category;
      let nextBudget = fields.budget_category !== undefined ? fields.budget_category : existing.budget_category;
      let nextInvoice = fields.invoice_plan_id !== undefined ? fields.invoice_plan_id : existing.invoice_plan_id;

      if (fields.project_id !== undefined && fields.project_id !== existing.project_id && fields.invoice_plan_id === undefined) {
        nextInvoice = null;
      }
      if (fields.type !== undefined && fields.type !== existing.type) {
        if (nextType === 'income') {
          nextBudget = null;
          if (fields.invoice_plan_id === undefined) nextInvoice = null;
        } else {
          nextInvoice = null;
        }
      }
      if (fields.category !== undefined && fields.budget_category === undefined && nextType === 'expense') {
        nextBudget = defaultBudgetCategory(nextCategory);
      }

      const normalized = normalizeTransactionLinks({
        type: nextType,
        projectId: nextProjectId,
        category: nextCategory,
        budgetCategory: nextBudget,
        invoicePlanId: nextInvoice,
      });
      fields.budget_category = normalized.budget_category;
      fields.invoice_plan_id = normalized.invoice_plan_id;
      sendJson(res, 200, updateRow('transactions', id, fields));
      return true;
    }
    if (match && method === 'DELETE') {
      requireManager(user);
      const id = match[1];
      rowById('transactions', id);
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/persons' && method === 'POST') {
      requireManager(user);
      const body = await readJson(req);
      const fields = parsePerson(body);
      const id = randomUUID();
      db.prepare(
        'INSERT INTO persons (id, name, role, email, phone, department, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id, fields.name, fields.role ?? 'other', fields.email ?? '', fields.phone ?? '',
        fields.department ?? '', fields.is_active ?? 1, nowISO()
      );
      sendJson(res, 201, mapPerson(rowById('persons', id)));
      return true;
    }

    match = pathname.match(/^\/api\/persons\/([^/]+)$/);
    if (match && method === 'PATCH') {
      requireManager(user);
      const id = match[1];
      rowById('persons', id);
      sendJson(res, 200, mapPerson(updateRow('persons', id, parsePerson(await readJson(req), { partial: true }))));
      return true;
    }
    if (match && method === 'DELETE') {
      requireManager(user);
      const id = match[1];
      rowById('persons', id);
      const linkedUser = db.prepare('SELECT full_name FROM users WHERE person_id = ?').get(id);
      if (linkedUser) {
        throw new HttpError(400, `该人员已关联用户“${linkedUser.full_name}”，请先解除账号关联`);
      }
      db.prepare('DELETE FROM persons WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/assignments' && method === 'POST') {
      requireManager(user);
      const body = await readJson(req);
      const projectId = requiredString(body.project_id, '项目');
      const personId = requiredString(body.person_id, '人员');
      rowById('projects', projectId);
      rowById('persons', personId);
      const existing = db.prepare(
        'SELECT id FROM project_assignments WHERE project_id = ? AND person_id = ?'
      ).get(projectId, personId);
      if (existing) throw new HttpError(400, '该人员已分配到该项目');
      const hours = requiredNumber(body.planned_hours, '计划工时', { min: 1, max: 100000 });
      const id = randomUUID();
      db.prepare(
        'INSERT INTO project_assignments (id, project_id, person_id, planned_hours, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, projectId, personId, hours, nowISO());
      sendJson(res, 201, rowById('project_assignments', id));
      return true;
    }

    match = pathname.match(/^\/api\/assignments\/([^/]+)$/);
    if (match && method === 'PATCH') {
      requireManager(user);
      const id = match[1];
      rowById('project_assignments', id);
      const body = await readJson(req);
      const hours = requiredNumber(body.planned_hours, '计划工时', { min: 1, max: 100000 });
      sendJson(res, 200, updateRow('project_assignments', id, { planned_hours: hours }));
      return true;
    }
    if (match && method === 'DELETE') {
      requireManager(user);
      const id = match[1];
      rowById('project_assignments', id);
      db.prepare('DELETE FROM project_assignments WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/timesheets' && method === 'POST') {
      const body = await readJson(req);
      const fields = parseTimesheet(body, user);
      const id = randomUUID();
      db.prepare(
        'INSERT INTO timesheets (id, project_id, person_id, date, hours, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id, fields.project_id, fields.person_id, fields.date, fields.hours,
        fields.description ?? '', nowISO()
      );
      sendJson(res, 201, rowById('timesheets', id));
      return true;
    }

    match = pathname.match(/^\/api\/timesheets\/([^/]+)$/);
    if (match && method === 'PATCH') {
      const id = match[1];
      const existing = rowById('timesheets', id);
      if (user.role === 'employee' && existing.person_id !== user.person_id) {
        throw new HttpError(403, '只能修改自己的工时记录');
      }
      const fields = parseTimesheet(await readJson(req), user, { partial: true, existing });
      sendJson(res, 200, updateRow('timesheets', id, fields));
      return true;
    }
    if (match && method === 'DELETE') {
      const id = match[1];
      const existing = rowById('timesheets', id);
      if (user.role === 'employee' && existing.person_id !== user.person_id) {
        throw new HttpError(403, '只能删除自己的工时记录');
      }
      db.prepare('DELETE FROM timesheets WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/invoices' && method === 'POST') {
      requireManager(user);
      const body = await readJson(req);
      const projectId = requiredString(body.project_id, '项目');
      rowById('projects', projectId);
      if (!INVOICE_STATUSES.includes(body.status ?? 'unbilled')) throw new HttpError(400, '回款状态无效');
      const percentage = requiredNumber(body.percentage, '比例', { min: 1, max: 100 });
      const used = db.prepare(
        'SELECT COALESCE(SUM(percentage), 0) AS total FROM invoice_plans WHERE project_id = ?'
      ).get(projectId).total;
      if (used + percentage > 100) {
        throw new HttpError(400, `回款比例合计不能超过 100%，剩余 ${Math.max(0, 100 - used)}%`);
      }
      const id = randomUUID();
      db.prepare(
        'INSERT INTO invoice_plans (id, project_id, date, stage, percentage, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id, projectId, requiredDate(body.date, '日期'), requiredString(body.stage, '阶段', { max: 120 }),
        percentage, body.status ?? 'unbilled', nowISO()
      );
      sendJson(res, 201, rowById('invoice_plans', id));
      return true;
    }

    match = pathname.match(/^\/api\/invoices\/([^/]+)$/);
    if (match && method === 'PATCH') {
      requireManager(user);
      const id = match[1];
      const existing = rowById('invoice_plans', id);
      const body = await readJson(req);
      const fields = {};
      if (body.status !== undefined) {
        if (!INVOICE_STATUSES.includes(body.status)) throw new HttpError(400, '回款状态无效');
        fields.status = body.status;
      }
      if (body.date !== undefined) fields.date = requiredDate(body.date, '日期');
      if (body.stage !== undefined) fields.stage = requiredString(body.stage, '阶段', { max: 120 });
      if (body.percentage !== undefined) {
        const percentage = requiredNumber(body.percentage, '比例', { min: 1, max: 100 });
        const used = db.prepare(
          'SELECT COALESCE(SUM(percentage), 0) AS total FROM invoice_plans WHERE project_id = ? AND id <> ?'
        ).get(existing.project_id, id).total;
        if (used + percentage > 100) {
          throw new HttpError(400, `回款比例合计不能超过 100%，剩余 ${Math.max(0, 100 - used)}%`);
        }
        fields.percentage = percentage;
      }
      sendJson(res, 200, updateRow('invoice_plans', id, fields));
      return true;
    }
    if (match && method === 'DELETE') {
      requireManager(user);
      const id = match[1];
      rowById('invoice_plans', id);
      db.prepare('UPDATE transactions SET invoice_plan_id = NULL WHERE invoice_plan_id = ?').run(id);
      db.prepare('DELETE FROM invoice_plans WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    match = pathname.match(/^\/api\/projects\/([^/]+)\/attachments$/);
    if (match && method === 'POST') {
      requireManager(user);
      const projectId = match[1];
      rowById('projects', projectId);
      const body = await readJson(req);
      const fileName = requiredString(body.file_name, '文件名', { max: 255 });
      const ext = path.extname(fileName).toLowerCase();
      if (!['.xlsx', '.xls'].includes(ext)) {
        throw new HttpError(400, '仅支持上传 Excel 文件（.xlsx / .xls）');
      }
      if (typeof body.data_base64 !== 'string' || body.data_base64.length === 0) {
        throw new HttpError(400, '文件内容为空');
      }
      const buffer = Buffer.from(body.data_base64, 'base64');
      if (buffer.length === 0) throw new HttpError(400, '文件内容为空');
      if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, '文件大小不能超过 5 MB');
      const id = randomUUID();
      const storedName = `${id}${ext}`;
      fs.writeFileSync(path.join(uploadDir, storedName), buffer);
      db.prepare(
        `INSERT INTO attachments (id, project_id, file_name, file_type, file_size, storage_path, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, projectId, fileName, optionalString(body.file_type, { max: 200 }) || 'application/octet-stream',
        buffer.length, storedName, user.id, nowISO()
      );
      sendJson(res, 201, mapAttachment(rowById('attachments', id)));
      return true;
    }

    match = pathname.match(/^\/api\/attachments\/([^/]+)\/download$/);
    if (match && method === 'GET') {
      requireManager(user);
      const row = rowById('attachments', match[1]);
      const fullPath = path.join(uploadDir, row.storage_path);
      if (!fullPath.startsWith(path.resolve(uploadDir) + path.sep) || !fs.existsSync(fullPath)) {
        throw new HttpError(404, '附件文件不存在');
      }
      res.writeHead(200, {
        'Content-Type': row.file_type || 'application/octet-stream',
        'Content-Length': row.file_size,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(fullPath).pipe(res);
      return true;
    }

    match = pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (match && method === 'DELETE') {
      requireManager(user);
      const id = match[1];
      const row = rowById('attachments', id);
      db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
      try { fs.unlinkSync(path.join(uploadDir, row.storage_path)); } catch { /* ignore missing file */ }
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendJson(res, 404, { error: '接口不存在' });
    return true;
  }

  async function handler(req, res) {
    try {
      const handled = await handleApi(req, res);
      if (!handled) sendJson(res, 404, { error: '接口不存在' });
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error('[api]', err);
        sendJson(res, 500, { error: '服务器内部错误，请稍后重试' });
      }
    }
  }

  return {
    handler,
    db,
    uploadDir,
    close() { db.close(); },
  };
}
