begin;
drop policy if exists "vc_select" on public.violation_cases;
drop policy if exists "vc_insert" on public.violation_cases;
drop index if exists public.idx_violation_cases_source_video_id_unique;
alter table public.violation_cases
  drop column if exists source_video_id,
  drop column if exists source_metadata,
  drop column if exists highlighted_sections;

create policy "vc_insert"
  on public.violation_cases
  for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = submitted_by
    and (account_id is null or owns_account(account_id))
  );

create policy "vc_select"
  on public.violation_cases
  for select
  using (
    auth.role() = 'authenticated'
    and is_deleted = false
  );

delete from supabase_migrations.schema_migrations
where version in ('20260819130400', '20260716180000');
select pg_notify('pgrst', 'reload schema');
commit;
