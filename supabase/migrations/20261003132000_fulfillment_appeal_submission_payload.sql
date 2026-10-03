alter table public.fulfillment_appeals
  add column if not exists submission_payload jsonb;

comment on column public.fulfillment_appeals.submission_payload is
  '申请补交时暂存的完整视频提交请求；审批通过后由成员通知入口续交，成功后清空。';
