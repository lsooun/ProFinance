/*
# Fix function search_path and trigger function security

## Problem
The `handle_new_user()` and `update_updated_at()` functions have mutable search_path,
which causes "Database error querying schema" when Supabase Auth tries to fire the
`on_auth_user_created` trigger during login/signup. The function can't resolve the
`profiles` table without an explicit search_path.

## Changes
1. Recreate `handle_new_user()` with `SET search_path = ''` (uses auth schema's path)
   and explicit `public.profiles` table reference.
2. Recreate `update_updated_at()` with `SET search_path = public`.
3. Revoke EXECUTE on `handle_new_user` from anon and authenticated (it's a trigger only).
*/

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'manager');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Revoke direct execution from anon and authenticated (trigger-only function)
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon, authenticated;

-- Fix update_updated_at search_path
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
DROP FUNCTION IF EXISTS update_updated_at();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
