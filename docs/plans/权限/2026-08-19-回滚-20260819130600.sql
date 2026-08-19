begin;
alter table public.teams drop column if exists is_demo;
delete from supabase_migrations.schema_migrations where version in ('20260819130600', '20260718110000');
select pg_notify('pgrst', 'reload schema');
commit;
