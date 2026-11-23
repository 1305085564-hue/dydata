-- R7：识别记录带上接口入口生成的请求编号，与 ai_call_attempts.request_id 对齐
-- 只增不改：新列可为空，旧版本应用不写该列也能照常插入；旧数据留空不影响查询。

alter table public.ocr_recognition_logs
  add column if not exists request_id uuid;

-- 按接口返回的编号排查"这一次识别"：两张表都用它做检索键。
create index if not exists idx_ocr_recognition_logs_request_id
  on public.ocr_recognition_logs (request_id);
