-- Provider key health RPC for rewrite v2 provider routing.
--
-- [重放修复 2026-09-27] 本文件引用 public.ai_provider_keys，但该表由**更晚**的
--   20260629000000_rewrite_skills_and_documents.sql 创建 —— 顺序倒置。空库重放到本步时
--   表尚不存在，原文直接报 42P01，整条重放中断。
--   线上只读核对（2026-09-27）：idx_provider_keys_health 索引与 bump_provider_key_failure
--   函数**在线上均不存在**，即本文件的效果在两端都不存在。
--   处置：整段加存在性守卫。表不存在时跳过（与线上形态一致）；表存在时按原文逐字执行。

do $repair_20260628134819$
begin
  if to_regclass('public.ai_provider_keys') is null then
    raise notice '20260628134819: public.ai_provider_keys 尚不存在，跳过 provider key health RPC（与线上现状一致）';
    return;
  end if;

  execute $ddl$
    create index if not exists idx_provider_keys_health
      on public.ai_provider_keys(consecutive_failures, unhealthy_until);
  $ddl$;

  execute $ddl$
    create or replace function public.bump_provider_key_failure(
      key_id uuid,
      error_message text default null
    )
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      update public.ai_provider_keys
      set
        consecutive_failures = public.ai_provider_keys.consecutive_failures + 1,
        unhealthy_until = case
          when public.ai_provider_keys.consecutive_failures + 1 >= 3
            then timezone('utc'::text, now()) + interval '5 minutes'
          else public.ai_provider_keys.unhealthy_until
        end,
        last_failure_at = timezone('utc'::text, now()),
        last_error_message = left(coalesce(error_message, ''), 500),
        updated_at = timezone('utc'::text, now())
      where id = key_id;
    end;
    $fn$;
  $ddl$;

  execute $ddl$
    revoke all on function public.bump_provider_key_failure(uuid, text) from public, anon, authenticated;
  $ddl$;

  execute $ddl$
    grant execute on function public.bump_provider_key_failure(uuid, text) to service_role;
  $ddl$;
end$repair_20260628134819$;
