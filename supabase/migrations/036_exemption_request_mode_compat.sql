alter table public.exemption_request
  drop constraint if exists exemption_request_exemption_type_check;

alter table public.exemption_request
  add constraint exemption_request_exemption_type_check
  check (
    exemption_type in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent')
  );
