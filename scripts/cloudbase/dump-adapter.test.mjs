import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSchemaStatement, adaptSchemaDump } from './dump-adapter.mjs';

test('UUID identity casts retain managed auth.uid and change all business uses', () => {
  const r = adaptSchemaStatement("CREATE FUNCTION public.f(x uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql AS $$ SELECT x = auth.uid(); $$;");
  assert.match(r.sql, /DEFAULT \(auth.uid\(\)\)::uuid/);
  assert.match(r.sql, /x = \(auth.uid\(\)\)::uuid/);
  assert.equal(r.changes.uidCasts, 2);
});

test('13 child relations retain foreign keys through profiles; profile root is detached', () => {
  const child = adaptSchemaStatement('ALTER TABLE ONLY public.usage_events ADD CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;');
  assert.match(child.sql, /REFERENCES public.profiles\(id\) ON DELETE CASCADE/);
  const root = adaptSchemaStatement('ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;');
  assert.equal(root.sql, null);
  assert.equal(root.reason, 'managed-auth-root');
});

test('omit platform-owned defaults and prevent anonymous grants while retaining authenticated ACL', () => {
  assert.equal(adaptSchemaStatement('CREATE SCHEMA public;').sql, null);
  assert.equal(adaptSchemaStatement('SET row_security = off;').sql, null);
  assert.equal(adaptSchemaStatement('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;').sql, null);
  assert.equal(adaptSchemaStatement('GRANT ALL ON FUNCTION public.f() TO anon;').sql, null);
  assert.equal(adaptSchemaStatement('GRANT USAGE ON SCHEMA public TO postgres;').sql, null);
  assert.equal(adaptSchemaStatement('GRANT ALL ON FUNCTION public.f() TO authenticated;').sql, 'GRANT ALL ON FUNCTION public.f() TO authenticated;');
});

test('data and unsupported platform dependencies fail closed', () => {
  assert.throws(() => adaptSchemaStatement("INSERT INTO public.x VALUES ('auth.uid()');"), /schema/);
  assert.throws(() => adaptSchemaStatement('CREATE VIEW public.x AS SELECT id FROM auth.users;'), /managed auth/);
});

test('whole dump records explicit changes and preserves historical tables and trigger bindings', () => {
  const r = adaptSchemaDump('\\restrict abc\nCREATE TABLE public.old_table(id uuid);\nCREATE FUNCTION public.f() RETURNS uuid LANGUAGE sql AS $$ SELECT auth.uid(); $$;\nCREATE TRIGGER x BEFORE INSERT ON public.old_table FOR EACH ROW EXECUTE FUNCTION public.f();\n\\unrestrict abc\n');
  assert.equal(r.statements.length, 3);
  assert.equal(r.summary.uidCasts, 1);
  assert.match(r.statements[0], /old_table/);
  assert.match(r.statements[2], /CREATE TRIGGER/);
});
