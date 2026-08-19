begin;
drop table if exists public.feedback_card_replies;
alter table public.content_feedback_cards
  drop constraint if exists content_feedback_cards_employee_reply_status_check,
  drop column if exists employee_reply_status,
  drop column if exists employee_reply_text,
  drop column if exists employee_replied_at,
  drop column if exists employee_replied_by;
alter table public.content_feedback_cards
  drop constraint if exists content_feedback_cards_pkey;
delete from supabase_migrations.schema_migrations where version = '20260819130800';
select pg_notify('pgrst', 'reload schema');
commit;
