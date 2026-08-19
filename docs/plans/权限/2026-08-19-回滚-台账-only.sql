begin;
delete from supabase_migrations.schema_migrations
where version in (
  '20260805120000', '20260807103000', '20260818000000',
  '20260718103000', '20260806090000'
);
select pg_notify('pgrst', 'reload schema');
commit;
