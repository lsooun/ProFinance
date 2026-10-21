import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const nowISO = () => new Date().toISOString();

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'other',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  is_active INTEGER NOT NULL DEFAULT 1,
  person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'presales' CHECK (status IN ('presales', 'in_progress', 'completed', 'cancelled')),
  manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  client TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  budget_labor REAL NOT NULL DEFAULT 0,
  budget_travel REAL NOT NULL DEFAULT 0,
  budget_other REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  cost_sheet TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS project_assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  planned_hours REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_person ON project_assignments(person_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL DEFAULT '其他',
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  transaction_date TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  budget_category TEXT,
  invoice_plan_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);

CREATE TABLE IF NOT EXISTS timesheets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0 CHECK (hours >= 0),
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timesheets_project ON timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_person ON timesheets(person_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(date);

CREATE TABLE IF NOT EXISTS invoice_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  stage TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  status TEXT NOT NULL DEFAULT 'unbilled' CHECK (status IN ('unbilled', 'invoiced', 'collected')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoice_plans(project_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  storage_path TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);
`;

function monthDate(offset, day) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function seedDatabase(db) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (existing.count > 0) return;

  const now = nowISO();
  const personIds = Array.from({ length: 6 }, () => randomUUID());
  const projectIds = Array.from({ length: 3 }, () => randomUUID());

  const insertPerson = db.prepare(
    'INSERT INTO persons (id, name, role, email, phone, department, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertUser = db.prepare(
    'INSERT INTO users (id, email, password_hash, full_name, role, is_active, person_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, description, status, manager_user_id, client, start_date, end_date,
      budget_labor, budget_travel, budget_other, revenue, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAssignment = db.prepare(
    'INSERT INTO project_assignments (id, project_id, person_id, planned_hours, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (id, project_id, type, category, description, amount, transaction_date, created_by, budget_category, invoice_plan_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertTimesheet = db.prepare(
    'INSERT INTO timesheets (id, project_id, person_id, date, hours, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertInvoice = db.prepare(
    'INSERT INTO invoice_plans (id, project_id, date, stage, percentage, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    const persons = [
      ['张伟', 'project_manager', 'zhang.wei@company.com', '138-0000-0001', '交付部', 1],
      ['李梅', 'consultant', 'li.mei@company.com', '138-0000-0002', '咨询部', 1],
      ['王磊', 'developer', 'wang.lei@company.com', '138-0000-0003', '工程部', 1],
      ['陈宇', 'developer', 'chen.yu@company.com', '138-0000-0004', '工程部', 1],
      ['刘芳', 'designer', 'liu.fang@company.com', '138-0000-0005', '设计部', 1],
      ['赵明', 'qa', 'zhao.ming@company.com', '138-0000-0006', '质量部', 0],
    ];
    persons.forEach((p, i) => insertPerson.run(personIds[i], p[0], p[1], p[2], p[3], p[4], p[5], now));

    // 三种演示账号，密码均为 123456
    const managerUserId = randomUUID();
    insertUser.run(randomUUID(), 'admin@company.com', hashPassword('123456'), '管理员', 'admin', 1, null, now);
    insertUser.run(managerUserId, 'manager@company.com', hashPassword('123456'), '张伟', 'manager', 1, personIds[0], now);
    insertUser.run(randomUUID(), 'wang.lei@company.com', hashPassword('123456'), '王磊', 'employee', 1, personIds[2], now);

    insertProject.run(
      projectIds[0], '企业官网改版', '对公司官网进行整体视觉与交互升级',
      'in_progress', managerUserId, '艾克米公司', monthDate(9, 15), monthDate(-2, 31),
      35000, 5000, 10000, 45000, now, now
    );
    insertProject.run(
      projectIds[1], '移动端应用开发', '为客户交付 iOS 与 Android 客户端',
      'presales', null, '智流科技', monthDate(-1, 1), monthDate(-3, 31),
      80000, 15000, 25000, 0, now, now
    );
    insertProject.run(
      projectIds[2], '云平台迁移', '将本地基础设施迁移至云平台',
      'completed', managerUserId, '数联数据', monthDate(13, 1), monthDate(1, 28),
      50000, 10000, 20000, 85000, now, now
    );

    [
      [projectIds[0], personIds[0], 120],
      [projectIds[0], personIds[2], 200],
      [projectIds[0], personIds[4], 80],
      [projectIds[2], personIds[1], 100],
      [projectIds[2], personIds[3], 160],
    ].forEach(([projectId, personId, hours]) =>
      insertAssignment.run(randomUUID(), projectId, personId, hours, now)
    );

    [
      [projectIds[0], 'income', '开发服务', '第一阶段回款', 25000, monthDate(0, 15)],
      [projectIds[0], 'expense', '工资', '开发人员工资', 15000, monthDate(0, 15)],
      [projectIds[0], 'income', '开发服务', '第二阶段回款', 20000, monthDate(1, 15)],
      [projectIds[0], 'expense', '软件', '设计工具订阅', 1200, monthDate(1, 15)],
      [projectIds[2], 'income', '咨询服务', '迁移项目尾款', 85000, monthDate(2, 10)],
      [projectIds[2], 'expense', '工资', '云工程师工资', 30000, monthDate(2, 10)],
      [null, 'expense', '办公', '办公室租金', 5000, monthDate(0, 5)],
      [null, 'expense', '办公', '办公室租金', 5000, monthDate(1, 5)],
    ].forEach(([projectId, type, category, description, amount, date]) => {
      const budgetCategory = type === 'expense'
        ? category === '工资'
          ? 'labor'
          : category === '差旅'
            ? 'travel'
            : 'other'
        : null;
      insertTransaction.run(
        randomUUID(), projectId, type, category, description, amount, date, null, budgetCategory, null, now
      );
    });

    [
      [projectIds[0], personIds[0], monthDate(0, 18), 8, '项目启动与规划'],
      [projectIds[0], personIds[2], monthDate(0, 18), 8, '后端接口搭建'],
      [projectIds[0], personIds[2], monthDate(1, 5), 6, '接口开发'],
      [projectIds[0], personIds[4], monthDate(1, 5), 4, '界面设计稿'],
      [projectIds[0], personIds[0], monthDate(1, 15), 5, '客户评审会议'],
      [projectIds[2], personIds[1], monthDate(2, 10), 8, '迁移方案设计'],
      [projectIds[2], personIds[3], monthDate(2, 10), 8, '云基础设施搭建'],
      [projectIds[2], personIds[3], monthDate(2, 20), 6, '数据迁移脚本'],
    ].forEach(([projectId, personId, date, hours, description]) =>
      insertTimesheet.run(randomUUID(), projectId, personId, date, hours, description, now)
    );

    [
      [projectIds[0], monthDate(4, 1), '第一阶段：项目启动', 40, 'collected'],
      [projectIds[0], monthDate(-1, 1), '第二阶段：交付验收', 60, 'unbilled'],
      [projectIds[2], monthDate(9, 1), '首期款', 30, 'collected'],
      [projectIds[2], monthDate(3, 15), '中期款', 40, 'invoiced'],
      [projectIds[2], monthDate(1, 28), '尾款', 30, 'unbilled'],
    ].forEach(([projectId, date, stage, percentage, status]) =>
      insertInvoice.run(randomUUID(), projectId, date, stage, percentage, status, now)
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function migrateDatabase(db) {
  const columns = db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name);
  if (!columns.includes('manager_user_id')) {
    db.exec('ALTER TABLE projects ADD COLUMN manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
    db.exec(`
      UPDATE projects
      SET manager_user_id = (
        SELECT users.id FROM users
        WHERE users.person_id = projects.manager_id
        LIMIT 1
      )
      WHERE manager_user_id IS NULL
    `);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_manager_user ON projects(manager_user_id)');

  if (!columns.includes('cost_sheet')) {
    db.exec('ALTER TABLE projects ADD COLUMN cost_sheet TEXT');
  }

  const attachmentColumns = db.prepare('PRAGMA table_info(attachments)').all().map((column) => column.name);
  if (!attachmentColumns.includes('category')) {
    db.exec("ALTER TABLE attachments ADD COLUMN category TEXT NOT NULL DEFAULT 'other'");
  }

  const transactionColumns = db.prepare('PRAGMA table_info(transactions)').all().map((column) => column.name);
  if (!transactionColumns.includes('budget_category')) {
    db.exec('ALTER TABLE transactions ADD COLUMN budget_category TEXT');
  }
  if (!transactionColumns.includes('invoice_plan_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN invoice_plan_id TEXT');
  }
  db.exec(`
    UPDATE transactions
    SET budget_category = CASE
      WHEN category IN ('工资', 'Salary') THEN 'labor'
      WHEN category IN ('差旅', 'Travel') THEN 'travel'
      ELSE 'other'
    END
    WHERE type = 'expense' AND budget_category IS NULL
  `);
}

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  migrateDatabase(db);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  seedDatabase(db);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowISO());
  return db;
}
