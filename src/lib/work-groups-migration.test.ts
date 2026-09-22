import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260922110000_work_groups_for_collab.sql", import.meta.url),
  "utf8",
);

test("work_groups 只做工种小队编制：kind 受 CHECK 约束、同 team 内组名唯一、挂 team 上", () => {
  assert.match(sql, /create table if not exists public\.work_groups/i);
  assert.match(sql, /team_id uuid not null references public\.teams \(id\) on delete cascade/i);
  assert.match(sql, /constraint work_groups_kind_check check \(kind in \('writer', 'talent', 'operator'\)\)/i);
  assert.match(sql, /constraint work_groups_team_id_name_key unique \(team_id, name\)/i);
  // 不改 teams 的权限模型：本 migration 不出现 teams 的 DDL/DML
  assert.doesNotMatch(sql, /alter table public\.teams/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*teams/i);
});

test("成员归属两列：可空、删组不删人、peer 与 operator 分开两列", () => {
  assert.match(sql, /add column if not exists work_peer_group_id uuid/i);
  assert.match(sql, /add column if not exists work_operator_group_id uuid/i);
  assert.match(
    sql,
    /add constraint profiles_work_peer_group_id_fkey[\s\S]*references public\.work_groups \(id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    sql,
    /add constraint profiles_work_operator_group_id_fkey[\s\S]*references public\.work_groups \(id\)[\s\S]*on delete set null/i,
  );
  assert.doesNotMatch(sql, /work_peer_group_id uuid not null/i);
});

test("work_groups 启用行级安全且不给直连通道，读写只走 service_role", () => {
  assert.match(sql, /alter table public\.work_groups enable row level security/i);
  assert.match(sql, /revoke all on table public\.work_groups from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.work_groups to service_role/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /grant[\s\S]*to authenticated/i);
});
