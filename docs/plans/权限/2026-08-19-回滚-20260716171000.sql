begin;
drop policy if exists "knowledge_cases_insert" on public.knowledge_cases;
create policy "knowledge_cases_insert"
  on public.knowledge_cases
  for insert
  with check (
    auth.role() = 'authenticated'
    and submitted_by = auth.uid()
    and (account_id is null or public.owns_account(account_id))
  );
delete from supabase_migrations.schema_migrations where version = '20260716171000';
select pg_notify('pgrst', 'reload schema');
commit;
