-- 现行申请与审批链路支持 legacy 与 V2 两组豁免类型。
-- 兼容生产仍停留在旧版 5 值约束的环境，避免合法申请被数据库拒绝。
alter table public.exemption_request
  drop constraint if exists exemption_request_exemption_type_check;

alter table public.exemption_request
  add constraint exemption_request_exemption_type_check
  check (
    exemption_type in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent')
  );
