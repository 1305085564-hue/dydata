-- 回滚：删除 20261019120000_backfill_appeals_ye_yan.sql 补录的 3 条记录
-- 只删本迁移创建的行（id 为提交链路稳定 UUID），不影响其他数据
begin;

delete from public.daily_reports where id in (
  $txt$9e4e3534-4cec-56bd-856b-b06435f6ccd0$txt$,
  $txt$0415b102-5772-5785-876e-0b06ee13b5f3$txt$,
  $txt$d378582d-cc75-5a31-b009-11d3780c3e91$txt$
);

delete from public.video_metrics_snapshots where video_id in (
  $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$,
  $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$,
  $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$
);

delete from public.videos where id in (
  $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$,
  $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$,
  $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$
);

delete from public.appeal_backfill_20261019_ledger where report_id in (
  $txt$9e4e3534-4cec-56bd-856b-b06435f6ccd0$txt$,
  $txt$0415b102-5772-5785-876e-0b06ee13b5f3$txt$,
  $txt$d378582d-cc75-5a31-b009-11d3780c3e91$txt$
);

commit;
