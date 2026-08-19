begin;
drop table if exists public.knowledge_cases;
delete from supabase_migrations.schema_migrations where version = '20260819130700';
select pg_notify('pgrst', 'reload schema');
commit;
