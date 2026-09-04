-- 申请人插入时不拥有 request_status 字段权限，必须由数据库默认值生成 pending。
-- 兼容历史环境中该列被收紧为 NOT NULL 但默认值丢失的情况。
update public.exemption_request
set request_status = 'pending'
where request_status is null;

alter table public.exemption_request
  alter column request_status set default 'pending',
  alter column request_status set not null;
