-- 20261005210000: 为 ai_provider_key_models 增加模型级健康状态。
-- 仅新增字段、索引和 service_role 专用失败记录 RPC；不删除或改写历史绑定数据。

alter table public.ai_provider_key_models
  add column if not exists consecutive_failures int not null default 0,
  add column if not exists unhealthy_until timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_message text,
  add column if not exists last_failure_scope text;

comment on column public.ai_provider_key_models.last_failure_scope is
  '最近一次模型探测失败归属：model=模型自身，unknown=无法确认；Key 级错误不写入此列';

create index if not exists idx_ai_provider_key_models_health
  on public.ai_provider_key_models(consecutive_failures, unhealthy_until);

do $ai_provider_key_model_health_rpc$
begin
  create or replace function public.bump_provider_key_model_failure(
    key_model_id uuid,
    error_message text default null,
    failure_scope text default 'unknown'
  )
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    update public.ai_provider_key_models
    set
      consecutive_failures = coalesce(public.ai_provider_key_models.consecutive_failures, 0) + 1,
      unhealthy_until = case
        when coalesce(public.ai_provider_key_models.consecutive_failures, 0) + 1 >= 3
          then timezone('utc'::text, now()) + interval '5 minutes'
        else public.ai_provider_key_models.unhealthy_until
      end,
      last_failure_at = timezone('utc'::text, now()),
      last_error_message = left(coalesce(error_message, ''), 500),
      last_failure_scope = case
        when failure_scope in ('model', 'unknown') then failure_scope
        else 'unknown'
      end
    where id = key_model_id;
  end;
  $fn$;

  revoke all on function public.bump_provider_key_model_failure(uuid, text, text)
    from public, anon, authenticated;
  grant execute on function public.bump_provider_key_model_failure(uuid, text, text)
    to service_role;
end$ai_provider_key_model_health_rpc$;
