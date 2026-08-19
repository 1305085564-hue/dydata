begin;
drop function if exists public.replace_daily_report_usage_record(uuid, uuid, uuid, uuid, text, uuid, date, integer, integer, text, text, text);
delete from supabase_migrations.schema_migrations where version = '20260718111500';
select pg_notify('pgrst', 'reload schema');
commit;
