begin;
drop function if exists public.submit_feedback_card_reply(uuid, uuid, text, text);
delete from supabase_migrations.schema_migrations where version = '20260718104500';
select pg_notify('pgrst', 'reload schema');
commit;
