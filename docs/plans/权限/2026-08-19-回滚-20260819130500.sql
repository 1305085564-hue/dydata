begin;
drop trigger if exists guard_profile_exemption_projection on public.profiles;
drop function if exists public.guard_profile_exemption_projection();
drop index if exists public.exemption_grant_request_id_unique;
delete from supabase_migrations.schema_migrations where version in ('20260819130500', '20260718113000');
select pg_notify('pgrst', 'reload schema');
commit;
