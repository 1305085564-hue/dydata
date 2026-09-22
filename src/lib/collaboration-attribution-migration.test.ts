import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 本文件锁定的是 update_collaboration_attribution 的**当前**定义。
// 历史定义见 20260728120000_atomic_collaboration_attribution.sql（初版）与
// 20260907113000_daily_reports_video_link.sql（加入 video_id 绑定，同时保留按账号+日期猜视频的兜底）。
// 20260922190000 起只认日报自己绑定的视频；本测试随之转向最新那份定义。
const raw = readFileSync(
  new URL("../../supabase/migrations/20260922190000_drop_guessed_video_attribution.sql", import.meta.url),
  "utf8",
);

// 断言只看可执行 SQL：注释里会引用被删掉的旧写法（published_at / uploaded_at）作解释，
// 不剥掉会让下方的反向断言误报。
const sql = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

test("归属补录 RPC 在一次数据库事务里锁定日报并同步更新日报与视频", () => {
  assert.match(sql, /create or replace function public\.update_collaboration_attribution/i);
  assert.match(sql, /from public\.daily_reports[\s\S]*for update/i);
  assert.match(sql, /report_date\s*>=\s*date\s*'2026-07-27'/i);
  assert.match(sql, /update public\.daily_reports/i);
  assert.match(sql, /update public\.videos/i);
  assert.match(sql, /lifecycle_state\s*=\s*'active'/i);
});

test("日报未绑定视频时不再按账号+日期猜视频", () => {
  // 取视频只有一条路径：日报自己绑定的 video_id
  assert.match(sql, /if v_report\.video_id is not null then[\s\S]*where id = v_report\.video_id/i);
  assert.doesNotMatch(sql, /where account_id = v_report\.account_id/i);
  assert.doesNotMatch(sql, /timezone\('Asia\/Shanghai'/i);
  assert.doesNotMatch(sql, /published_at/i);
  assert.doesNotMatch(sql, /uploaded_at/i);
});

test("视频配对不到时 RPC 不抛错并返回 videoUpdated false", () => {
  assert.match(sql, /if v_video_id is not null then[\s\S]*update public\.videos/i);
  assert.match(sql, /'videoUpdated',[\s\S]*v_video_id is not null/i);
  assert.doesNotMatch(sql, /v_video_id is null then[\s\S]*raise exception/i);
});

test("归属补录 RPC 只授权 service_role 调用", () => {
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});
