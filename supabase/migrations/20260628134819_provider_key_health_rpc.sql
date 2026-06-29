-- Provider key health RPC for rewrite v2 provider routing.

create index if not exists idx_provider_keys_health
  on public.ai_provider_keys(consecutive_failures, unhealthy_until);

create or replace function public.bump_provider_key_failure(
  key_id uuid,
  error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.bump_provider_key_failure(uuid, text) from public;
revoke all on function public.bump_provider_key_failure(uuid, text) from anon;
revoke all on function public.bump_provider_key_failure(uuid, text) from authenticated;
grant execute on function public.bump_provider_key_failure(uuid, text) to service_role;
