/*
# Create initial schema for project & financial management app

This migration sets up the complete database schema for a project and financial
management application. It creates tables for user profiles, projects, and financial
transactions (income/expenses), with row-level security policies so authenticated
users can manage all data.

## 1. New Tables

### profiles
- Extends Supabase auth.users with app-specific fields.
- `id` (uuid, PK, references auth.users) — one-to-one with auth user
- `full_name` (text) — display name
- `role` (text) — 'admin' or 'manager' (determines permissions)
- `is_active` (boolean) — whether the user can log in
- `created_at` (timestamptz)

### projects
- `id` (uuid, PK)
- `name` (text, not null)
- `description` (text)
- `status` (text) — one of: 'presales', 'in_progress', 'completed', 'cancelled'
- `manager_id` (uuid, references profiles) — project manager
- `client` (text) — client name
- `start_date` (date)
- `end_date` (date)
- `budget` (numeric) — planned budget
- `revenue` (numeric) — actual revenue
- `cost` (numeric) — actual cost
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### transactions
- `id` (uuid, PK)
- `project_id` (uuid, references projects, nullable) — optional link to a project
- `type` (text) — 'income' or 'expense'
- `category` (text) — e.g. 'salary', 'materials', 'consulting', 'software'
- `description` (text)
- `amount` (numeric, not null) — always positive
- `transaction_date` (date, not null)
- `created_by` (uuid, references auth.users)
- `created_at` (timestamptz)

## 2. Security (RLS)
- All tables have RLS enabled.
- profiles: authenticated users can read all profiles; users can update their own profile; admins (checked via profile role) can insert/update/delete profiles.
- projects: authenticated users can CRUD all projects.
- transactions: authenticated users can CRUD all transactions.
*/

-- ===== profiles =====
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  role text NOT NULL DEFAULT 'manager',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
CREATE POLICY "profiles_insert_admin" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON profiles;
CREATE POLICY "profiles_update_self_or_admin" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ===== projects =====
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'presales' CHECK (status IN ('presales', 'in_progress', 'completed', 'cancelled')),
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  client text DEFAULT '',
  start_date date,
  end_date date,
  budget numeric(14,2) NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  cost numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_all" ON projects;
CREATE POLICY "projects_select_all" ON projects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "projects_insert_all" ON projects;
CREATE POLICY "projects_insert_all" ON projects FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "projects_update_all" ON projects;
CREATE POLICY "projects_update_all" ON projects FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "projects_delete_all" ON projects;
CREATE POLICY "projects_delete_all" ON projects FOR DELETE
  TO authenticated USING (true);

-- ===== transactions =====
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL DEFAULT 'general',
  description text DEFAULT '',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_all" ON transactions;
CREATE POLICY "transactions_select_all" ON transactions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "transactions_insert_all" ON transactions;
CREATE POLICY "transactions_insert_all" ON transactions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "transactions_update_all" ON transactions;
CREATE POLICY "transactions_update_all" ON transactions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "transactions_delete_all" ON transactions;
CREATE POLICY "transactions_delete_all" ON transactions FOR DELETE
  TO authenticated USING (true);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);

-- ===== updated_at trigger for projects =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== Auto-create profile on signup =====
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'manager');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();