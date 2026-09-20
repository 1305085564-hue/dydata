import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((name) => name.endsWith("_fix_restore_report_link_id_ambiguity.sql"))
  .sort()
  .at(-1);

assert.ok(migrationName, "恢复回收站日报关联修复 migration 必须存在");

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

test("restore 分支使用限定列名，避免与 OUT 参数 id 歧义（42702）", () => {
  const restoreBranch = sql.match(/elsif p_action = 'restore'[\s\S]*?get diagnostics changed_count = row_count;/i)?.[0];
  assert.ok(restoreBranch, "缺少 restore 分支");
  assert.match(
    restoreBranch,
    /where public\.daily_reports\.id = \(/,
    "restore 分支必须用 public.daily_reports.id 限定列名",
  );
  assert.doesNotMatch(
    restoreBranch,
    /where\s+id\s*=\s*\(/,
    "restore 分支不允许出现裸 id 谓词（会与 OUT 参数歧义）",
  );
});

test("修复迁移保持 service_role 专用授权", () => {
  assert.match(sql, /revoke all on function public\.transition_video_lifecycle_with_report_link/i);
  assert.match(sql, /grant execute on function public\.transition_video_lifecycle_with_report_link\([\s\S]*?\)\s+to service_role;/i);
  assert.doesNotMatch(sql, /to\s+(public|anon|authenticated)\s*;/i, "不得向匿名/登录角色放开执行权");
});
