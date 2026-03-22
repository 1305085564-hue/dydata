create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references auth.users(id),
  entity_type text,
  entity_id uuid,
  action text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz default now()
);

alter table public.audit_log
  add column if not exists before_json jsonb,
  add column if not exists after_json jsonb;

alter table public.audit_log enable row level security;
