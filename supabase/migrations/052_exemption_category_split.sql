alter table public.exemption_request
  add column if not exists exemption_category text;

update public.exemption_request
set exemption_category = 'waive'
where exemption_category is null;

alter table public.exemption_request
  alter column exemption_category set default 'waive';

alter table public.exemption_request
  alter column exemption_category set not null;

alter table public.exemption_request
  drop constraint if exists exemption_request_exemption_category_check;

alter table public.exemption_request
  add constraint exemption_request_exemption_category_check
  check (exemption_category in ('waive', 'leave'));

alter table public.exemption_grant
  add column if not exists exemption_category text;

update public.exemption_grant
set exemption_category = 'waive'
where exemption_category is null;

alter table public.exemption_grant
  alter column exemption_category set default 'waive';

alter table public.exemption_grant
  alter column exemption_category set not null;

alter table public.exemption_grant
  drop constraint if exists exemption_grant_exemption_category_check;

alter table public.exemption_grant
  add constraint exemption_grant_exemption_category_check
  check (exemption_category in ('waive', 'leave'));

alter table public.profiles
  add column if not exists exemption_category text;

update public.profiles
set exemption_category = 'waive'
where exempt_type is not null
  and exemption_category is null;

alter table public.profiles
  drop constraint if exists profiles_exemption_fields_check;

alter table public.profiles
  add constraint profiles_exemption_fields_check
  check (
    (
      exempt_type is null
      and exempt_start_date is null
      and exempt_end_date is null
      and exempt_reason is null
      and exemption_category is null
      and status = 'active'
    )
    or (
      exempt_type = 'permanent'
      and exempt_start_date is null
      and exempt_end_date is null
      and exemption_category in ('waive', 'leave')
      and status = 'exempt'
    )
    or (
      exempt_type = 'temporary'
      and exempt_start_date is not null
      and exempt_end_date is not null
      and exempt_start_date <= exempt_end_date
      and exemption_category in ('waive', 'leave')
      and status = 'active'
    )
  );
