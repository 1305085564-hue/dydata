-- Reconcile legacy production tables that predate 026_ai_input_and_result.sql.
-- CREATE TABLE IF NOT EXISTS did not add the newer columns to an existing table.

begin;

alter table public.ai_input_bundle
  add column if not exists insight_scope text,
  add column if not exists scope_entity_id uuid,
  add column if not exists input_version integer default 1,
  add column if not exists data_quality_state text,
  add column if not exists input_json jsonb,
  add column if not exists generated_at timestamptz default now();

alter table public.ai_input_bundle
  alter column input_version set default 1,
  alter column generated_at set default now();

-- Production still has the legacy content_item_id/input/created_at columns.
-- Dynamic SQL keeps this migration valid for databases already on the canonical schema.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_input_bundle'
      and column_name = 'content_item_id'
  ) then
    execute $sql$
      update public.ai_input_bundle
      set scope_entity_id = coalesce(scope_entity_id, content_item_id)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_input_bundle'
      and column_name = 'input'
  ) then
    execute $sql$
      update public.ai_input_bundle
      set input_json = coalesce(input_json, input, '{}'::jsonb)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_input_bundle'
      and column_name = 'created_at'
  ) then
    execute $sql$
      update public.ai_input_bundle
      set generated_at = coalesce(generated_at, created_at, now())
    $sql$;
  end if;
end $$;

update public.ai_input_bundle
set insight_scope = coalesce(insight_scope, 'single_video'),
    input_json = coalesce(input_json, '{}'::jsonb),
    generated_at = coalesce(generated_at, now());

alter table public.ai_input_bundle
  alter column insight_scope set not null,
  alter column input_json set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_input_bundle'::regclass
      and conname = 'ai_input_bundle_insight_scope_check'
  ) then
    alter table public.ai_input_bundle
      add constraint ai_input_bundle_insight_scope_check
      check (insight_scope in ('single_video', 'member_week', 'member_month', 'team_week', 'team_month'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_input_bundle'::regclass
      and conname = 'ai_input_bundle_data_quality_state_check'
  ) then
    alter table public.ai_input_bundle
      add constraint ai_input_bundle_data_quality_state_check
      check (data_quality_state in ('sufficient', 'partial', 'insufficient'));
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
