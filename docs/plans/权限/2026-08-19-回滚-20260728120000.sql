begin;
drop function if exists public.update_collaboration_attribution(uuid, uuid, uuid, uuid);
delete from supabase_migrations.schema_migrations where version = '20260728120000';
select pg_notify('pgrst', 'reload schema');
commit;
