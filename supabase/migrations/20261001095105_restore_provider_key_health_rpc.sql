-- Restore the failure counter RPC that was recorded as applied by
-- 20260628134819_provider_key_health_rpc but is absent in production.
--
-- This is intentionally a new migration: the historical migration is already
-- present in the production ledger and must not be renamed or edited again.

do $restore_provider_key_health_rpc$
begin
  if to_regclass('public.ai_provider_keys') is null then
    raise notice '20261001095105: public.ai_provider_keys 尚不存在，跳过 provider key health RPC';
    return;
  end if;

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
end$restore_provider_key_health_rpc$;
