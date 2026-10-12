-- ============================================================
-- 10 月历史日报绑定修复（16 条作品）
-- 生成: 2026-10-13  依据: /tmp/fix_evidence.json（全部生产只读实测）
-- 背景: video-submit 同账号同日复用旧日报缺陷（已修复上线 da5de6c4 / 线上 32fe96f0）
--       造成 16 条作品有视频和 24h 快照但无有效日报。
-- 决策口径（阿禅确认）:
--   A 类 7 条: 日报改绑回正确视频，播放数保留成员当时填报值
--   B 类 7 条: 无日报，按 24h 快照真实值重建
--   C 类 2 条: 纯重复上传记录进回收站（A 类兄弟记录随改绑一并回收，共回收 9 条）
-- 执行纪律: 每个 BEGIN/COMMIT 独立事务; 先跑预检; 写入后核对"预期行数";
--           行数不符立即 ROLLBACK 该条并停止后续。
-- ============================================================

-- ===== 预检（只读）=====
SELECT 'A_reports_valid' AS k, count(*) AS n FROM daily_reports
 WHERE is_void = false AND id IN ('fa64890d-85e4-48cb-808a-3f14f0aa0e71', '7fef22b6-635d-4c5f-a472-a3db3e9df30e', 'fabc20e0-abb1-40b3-8b2b-4d34c948285a', '88c602bc-0f95-4311-a3c9-935b777c3ce9', 'd0dd0ad1-ee58-4106-bd83-9c8f1b9be6c8', 'b1d1058d-8b30-4a3c-bbee-99efe8d0787a', '90e849a8-0034-4651-ba12-d472aa57f13b');   -- 预期 7
SELECT 'A_siblings_linked' AS k, count(*) AS n FROM daily_reports
 WHERE is_void = false AND id IN ('fa64890d-85e4-48cb-808a-3f14f0aa0e71', '7fef22b6-635d-4c5f-a472-a3db3e9df30e', 'fabc20e0-abb1-40b3-8b2b-4d34c948285a', '88c602bc-0f95-4311-a3c9-935b777c3ce9', 'd0dd0ad1-ee58-4106-bd83-9c8f1b9be6c8', 'b1d1058d-8b30-4a3c-bbee-99efe8d0787a', '90e849a8-0034-4651-ba12-d472aa57f13b')
   AND video_id IN ('61c1a18d-db0a-5c72-9945-917259bcd8d7', 'fde267b2-a876-579e-8c13-bb6a61cbc809', '9c611ee8-dfca-5982-b377-faac6db78592', 'a44bc579-91a0-550e-af17-049abe26de7f', 'b1b8c60b-f7eb-5ff1-af46-ae4cd3cc1eb3', 'caa878a4-c774-5a76-8273-bae1665c30f4', 'c9593d9a-a87e-5f4f-9e27-1e773716164b');                  -- 预期 7
SELECT 'B_no_active_report' AS k, count(*) AS n FROM videos v
 WHERE v.id IN ('e9a5080f-635c-57da-85ea-965af7bd4017', '5bc82542-c1a1-5204-b0aa-563e9d771dde', '8da30d70-0a23-5af7-9349-d5996a05c1f5', 'bee23770-8fc2-56a5-b75b-e3d94b2f2aec', 'b9dd1a9c-be71-5415-a32f-f066e5473f55', '3a2713ff-ebfe-5ead-b8a6-d90d6c8699f3', '505aabcb-fc6d-5b3e-b32f-d63d3a314e4c')
   AND NOT EXISTS (SELECT 1 FROM daily_reports dr WHERE dr.video_id = v.id AND dr.is_void = false); -- 预期 7
SELECT 'C_targets_active' AS k, count(*) AS n FROM videos
 WHERE id IN ('c4367963-a20b-5c70-afd6-623b5a5c2817', 'dfbe3f65-4bb5-5698-b552-701bf9722bfc', '61c1a18d-db0a-5c72-9945-917259bcd8d7', 'fde267b2-a876-579e-8c13-bb6a61cbc809', '9c611ee8-dfca-5982-b377-faac6db78592', 'a44bc579-91a0-550e-af17-049abe26de7f', 'b1b8c60b-f7eb-5ff1-af46-ae4cd3cc1eb3', 'caa878a4-c774-5a76-8273-bae1665c30f4', 'c9593d9a-a87e-5f4f-9e27-1e773716164b')
   AND lifecycle_state = 'active';                                               -- 预期 9

-- ---------- A: 情绪好与坏 ----------
-- 日报 fa64890d 由重复记录 61c1a18d 改绑回 026ee8b9；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = '026ee8b9-5cbc-556b-988b-6b056c9b5c04'
 WHERE id = 'fa64890d-85e4-48cb-808a-3f14f0aa0e71' AND video_id = '61c1a18d-db0a-5c72-9945-917259bcd8d7' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = '61c1a18d-db0a-5c72-9945-917259bcd8d7' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- A: 卡位龙过往数据示例分析 ----------
-- 日报 7fef22b6 由重复记录 fde267b2 改绑回 e97f8b2f；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = 'e97f8b2f-4a22-5d5c-8bce-b1c4848c1b60'
 WHERE id = '7fef22b6-635d-4c5f-a472-a3db3e9df30e' AND video_id = 'fde267b2-a876-579e-8c13-bb6a61cbc809' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'fde267b2-a876-579e-8c13-bb6a61cbc809' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- A: 10月9日复盘 ----------
-- 日报 fabc20e0 由重复记录 9c611ee8 改绑回 c0f51e27；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = 'c0f51e27-e59b-5c47-ae18-e57ebf56c5e6'
 WHERE id = 'fabc20e0-abb1-40b3-8b2b-4d34c948285a' AND video_id = '9c611ee8-dfca-5982-b377-faac6db78592' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = '9c611ee8-dfca-5982-b377-faac6db78592' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- A: 10.9日复盘及下周一大盘预测 ----------
-- 日报 88c602bc 由重复记录 a44bc579 改绑回 70c129cf；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = '70c129cf-6f9f-55d6-8eb8-7145ec882a72'
 WHERE id = '88c602bc-0f95-4311-a3c9-935b777c3ce9' AND video_id = 'a44bc579-91a0-550e-af17-049abe26de7f' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'a44bc579-91a0-550e-af17-049abe26de7f' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- A: 10大买卖铁律 ----------
-- 日报 d0dd0ad1 由重复记录 b1b8c60b 改绑回 518aab68；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = '518aab68-d062-5118-bd17-9cefd540d10f'
 WHERE id = 'd0dd0ad1-ee58-4106-bd83-9c8f1b9be6c8' AND video_id = 'b1b8c60b-f7eb-5ff1-af46-ae4cd3cc1eb3' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'b1b8c60b-f7eb-5ff1-af46-ae4cd3cc1eb3' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- A: 买对了板块却买错了票？你可能站错了盘口 ----------
-- 日报 b1d1058d 由重复记录 caa878a4 改绑回 c926b105；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = 'c926b105-f2fb-5e07-8bd6-7a84a26b3061'
 WHERE id = 'b1d1058d-8b30-4a3c-bbee-99efe8d0787a' AND video_id = 'caa878a4-c774-5a76-8273-bae1665c30f4' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'caa878a4-c774-5a76-8273-bae1665c30f4' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- A: 龙头战法之竞价情绪，短线选手的基本功 ----------
-- 日报 90e849a8 由重复记录 c9593d9a 改绑回 703e6cc4；重复记录进回收站
BEGIN;
UPDATE daily_reports SET video_id = '703e6cc4-fc94-59fc-b612-440b7c773c88'
 WHERE id = '90e849a8-0034-4651-ba12-d472aa57f13b' AND video_id = 'c9593d9a-a87e-5f4f-9e27-1e773716164b' AND is_void = false;  -- 预期 1 行
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'c9593d9a-a87e-5f4f-9e27-1e773716164b' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- B: 炸板是不是主力出货，两条标准轻松判断（快照采集 2026-10-07，播放 2079） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  '747436bf-bfaf-4f1a-a219-4aad04a4340a', '2026-10-05', 'e9a5080f-635c-57da-85ea-965af7bd4017', '炸板是不是主力出货，两条标准轻松判断', '747436bf-bfaf-4f1a-a219-4aad04a4340a',
  2079, 30, 4, 1, 15,
  25, NULL, 7.81, 25,
  31.54, 37.28,
  NULL, '2026-10-05T05:34:00+00:00', '2026-10-07T10:46:02.991+00:00', '42695f2b-cf4c-4d89-96df-5c077e324c45',
  '747436bf-bfaf-4f1a-a219-4aad04a4340a', 'ed627263-f55b-4e30-95fd-38dc7db10575', '747436bf-bfaf-4f1a-a219-4aad04a4340a'
);  -- 预期 1 行
COMMIT;

-- ---------- B: 用Ai做选择，这5条指令要记牢。（快照采集 2026-10-09，播放 3027） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  'b88aa499-32f7-4da0-a196-35b33bd0de0b', '2026-10-08', '5bc82542-c1a1-5204-b0aa-563e9d771dde', '用Ai做选择，这5条指令要记牢。', 'b88aa499-32f7-4da0-a196-35b33bd0de0b',
  3027, 64, 0, 13, 57,
  11, NULL, 3.13, 10,
  27.76, 28.93,
  NULL, '2026-10-08T09:15:00+00:00', '2026-10-09T03:09:52.009+00:00', '8ef934d6-0a4e-4b8c-859d-cbb20e09bd44',
  'b88aa499-32f7-4da0-a196-35b33bd0de0b', 'b88aa499-32f7-4da0-a196-35b33bd0de0b', 'b88aa499-32f7-4da0-a196-35b33bd0de0b'
);  -- 预期 1 行
COMMIT;

-- ---------- B: 10消息大汇总（快照采集 2026-10-09，播放 710） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  'f66a919f-d85e-42ba-aa0d-0c2b60c2b357', '2026-10-08', '8da30d70-0a23-5af7-9349-d5996a05c1f5', '10消息大汇总', 'f66a919f-d85e-42ba-aa0d-0c2b60c2b357',
  710, 8, 0, 0, 2,
  0, 0, 1.41, 9,
  38.49, 20.39,
  NULL, '2026-10-08T09:57:00+00:00', '2026-10-09T03:09:12.547+00:00', 'd812827e-0a3c-4cec-91b2-4c677d59a331',
  'f66a919f-d85e-42ba-aa0d-0c2b60c2b357', 'f66a919f-d85e-42ba-aa0d-0c2b60c2b357', 'f66a919f-d85e-42ba-aa0d-0c2b60c2b357'
);  -- 预期 1 行
COMMIT;

-- ---------- B: 10.9周五大盘预测（快照采集 2026-10-09，播放 899） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  'ecbfc17e-d13f-4196-9876-3ec8efa2655c', '2026-10-08', 'bee23770-8fc2-56a5-b75b-e3d94b2f2aec', '10.9周五大盘预测', 'ecbfc17e-d13f-4196-9876-3ec8efa2655c',
  899, 6, 0, 0, 0,
  0, NULL, 3.01, 13,
  42.65, 28.88,
  NULL, '2026-10-08T11:27:00+00:00', '2026-10-09T02:54:11.685+00:00', '93ec9bde-192e-42f6-afb8-dba262bfd57b',
  '0aaebce6-b0a3-4340-ab00-f14d83f37e17', 'ecbfc17e-d13f-4196-9876-3ec8efa2655c', 'ecbfc17e-d13f-4196-9876-3ec8efa2655c'
);  -- 预期 1 行
COMMIT;

-- ---------- B: 10.9复盘，又猜对了（快照采集 2026-10-10，播放 13000） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  '747436bf-bfaf-4f1a-a219-4aad04a4340a', '2026-10-09', 'b9dd1a9c-be71-5415-a32f-f066e5473f55', '10.9复盘，又猜对了', '747436bf-bfaf-4f1a-a219-4aad04a4340a',
  13000, 121, 6, 10, 39,
  50, NULL, 2.75, 25,
  23.94, 57.5,
  NULL, '2026-10-09T10:31:00+00:00', '2026-10-10T05:34:19.941+00:00', '42695f2b-cf4c-4d89-96df-5c077e324c45',
  'f66a919f-d85e-42ba-aa0d-0c2b60c2b357', '747436bf-bfaf-4f1a-a219-4aad04a4340a', '747436bf-bfaf-4f1a-a219-4aad04a4340a'
);  -- 预期 1 行
COMMIT;

-- ---------- B: 踩中伪龙头比找不到龙头还难受（快照采集 2026-10-12，播放 1965） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  'bcfbf3f7-a693-4bd8-bed1-b93d58c7f922', '2026-10-11', '3a2713ff-ebfe-5ead-b8a6-d90d6c8699f3', '踩中伪龙头比找不到龙头还难受', 'bcfbf3f7-a693-4bd8-bed1-b93d58c7f922',
  1965, 24, 2, 2, 23,
  4, NULL, 1.92, 17,
  31.11, 31.56,
  NULL, '2026-10-11T00:00:00+00:00', '2026-10-12T03:21:41.653+00:00', '9071cfbb-0519-413d-b287-c1b009c65158',
  'bcfbf3f7-a693-4bd8-bed1-b93d58c7f922', 'bcfbf3f7-a693-4bd8-bed1-b93d58c7f922', 'bcfbf3f7-a693-4bd8-bed1-b93d58c7f922'
);  -- 预期 1 行
COMMIT;

-- ---------- B: 龙头战法之主线最优解，实战案例解析（快照采集 2026-10-12，播放 8102） ----------
BEGIN;
INSERT INTO daily_reports (
  user_id, report_date, video_id, title, submitter,
  play_count, likes, comments, shares, favorites,
  follower_gain, follower_convert, completion_rate, avg_play_duration,
  bounce_rate_2s, completion_rate_5s,
  content, published_at, uploaded_at, account_id,
  script_author_user_id, video_editor_user_id, operator_user_id
) VALUES (
  'c8661d4f-a74e-48a7-aa33-0cfa8f5edb2b', '2026-10-11', '505aabcb-fc6d-5b3e-b32f-d63d3a314e4c', '龙头战法之主线最优解，实战案例解析', 'c8661d4f-a74e-48a7-aa33-0cfa8f5edb2b',
  8102, 279, 9, 40, 278,
  77, 0, 8.62, 43,
  36.69, 45.73,
  NULL, '2026-10-11T09:01:00+00:00', '2026-10-12T03:09:24.247+00:00', '3c768fdb-2562-4e1e-8ec9-42a46527f9ba',
  '4f3670fc-8a15-4573-9625-32ea690175e7', 'c8661d4f-a74e-48a7-aa33-0cfa8f5edb2b', '67944f5a-99d5-4e80-8160-aefb4b5ea257'
);  -- 预期 1 行
COMMIT;

-- ---------- C: 重复记录进回收站 情绪好与坏 ----------
BEGIN;
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'c4367963-a20b-5c70-afd6-623b5a5c2817' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ---------- C: 重复记录进回收站 龙头战法之主线最优解，实战案例解析 ----------
BEGIN;
UPDATE videos SET lifecycle_state = 'trashed', trashed_at = now()
 WHERE id = 'dfbe3f65-4bb5-5698-b552-701bf9722bfc' AND lifecycle_state = 'active';               -- 预期 1 行
COMMIT;

-- ===== 事后验证（只读）：应返回 0 =====
SELECT count(*) AS still_missing FROM videos v
 WHERE v.lifecycle_state = 'active'
   AND v.published_at >= '2026-10-01' AND v.published_at < '2026-10-13'
   AND NOT EXISTS (SELECT 1 FROM daily_reports dr WHERE dr.video_id = v.id AND dr.is_void = false);

-- ===== 回滚参考（仅在需要整体撤销时人工执行） =====
-- A 类回滚: 把对应日报 video_id 改回各条注释中的兄弟 id，兄弟视频 lifecycle_state 改回 'active'、trashed_at 置 NULL
-- B 类回滚: DELETE FROM daily_reports WHERE video_id IN ('e9a5080f-635c-57da-85ea-965af7bd4017', '5bc82542-c1a1-5204-b0aa-563e9d771dde', '8da30d70-0a23-5af7-9349-d5996a05c1f5', 'bee23770-8fc2-56a5-b75b-e3d94b2f2aec', 'b9dd1a9c-be71-5415-a32f-f066e5473f55', '3a2713ff-ebfe-5ead-b8a6-d90d6c8699f3', '505aabcb-fc6d-5b3e-b32f-d63d3a314e4c') AND is_void = false;  -- 执行前逐条核对 created_at 晚于本次修复时间
-- C 类回滚: UPDATE videos SET lifecycle_state='active', trashed_at=NULL WHERE id IN ('c4367963-a20b-5c70-afd6-623b5a5c2817', 'dfbe3f65-4bb5-5698-b552-701bf9722bfc');
