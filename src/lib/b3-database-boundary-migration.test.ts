import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .find((name) => name.endsWith("_b3_close_public_rls_and_related_scopes.sql"));

assert.ok(migrationName, "缺少 B3 数据库边界收口 migration");
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const removalSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261016090000_remove_group_mode.sql"), "utf8");

test("五张暴露表全部开启 RLS 且匿名读写 ACL 收回", () => {
  for (const table of ["content_history", "content_item", "field_provenance", "script_segment", "submission_batch"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  assert.match(sql, /grant select on table public\.content_item, public\.script_segment to authenticated/i);
  assert.match(sql, /create policy b3_content_item_select_own_active on public\.content_item[\s\S]*?owner\s*=\s*auth\.uid\(\)[\s\S]*?membership_status\s*=\s*'active'/i);
  assert.doesNotMatch(sql, /create policy [^\n]+ on public\.script_segment/i);
});

test("移除跨公司边界后保留公司范围", () => {
  assert.match(removalSql, /create or replace function public\.visible_user_ids_v2\(p_actor_id uuid default auth\.uid\(\)\)/i);
  const scopeBody = removalSql.match(/create or replace function public\.visible_user_ids_v2\(p_actor_id uuid default auth\.uid\(\)\)[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.doesNotMatch(scopeBody, /p_group_mode|is_group_mode_active/i);
  assert.match(removalSql, /drop table if exists public\.group_mode_sessions cascade/i);
});

test("团队申请和三张视频子表覆盖目标范围，更新同时约束旧行与新行", () => {
  assert.match(sql, /create policy b3_team_join_requests_select_scope[\s\S]*?target_team_id[\s\S]*?actor\.team_id/i);
  assert.match(sql, /create policy b3_team_join_requests_insert_active[\s\S]*?membership_status\s*=\s*'active'/i);
  assert.match(sql, /create policy b3_team_join_requests_delete_active[\s\S]*?membership_status\s*=\s*'active'/i);
  for (const table of ["video_content_segments", "video_metrics_snapshots", "video_tags"]) {
    assert.match(sql, new RegExp(`create policy b3_${table}_select_scope on public\\.${table}[\\s\\S]*?visible_user_ids`, "i"));
    assert.match(sql, new RegExp(`create policy b3_${table}_update_scope on public\\.${table}[\\s\\S]*?using \\([\\s\\S]*?with check \\([\\s\\S]*?active_visible_user_ids`, "i"));
  }
});

test("旧 helper 收回匿名执行权且不从可写搜索路径加载对象", () => {
  assert.match(sql, /create or replace function public\.owns_account\(target_account_id uuid\)[\s\S]*?set search_path\s*=\s*''/i);
  assert.match(sql, /revoke all on function public\.owns_account\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.owns_account\(uuid\) to authenticated, service_role/i);
});
