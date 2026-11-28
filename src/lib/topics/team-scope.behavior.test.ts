import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import assert from "node:assert/strict";
import test from "node:test";
import { loadTopicsTeamScope } from "./team-scope";
import { loadSubTopicDetail } from "./data/detail";
import { validateTopicForSubmission } from "@/app/api/video-submit/topic-association";
import type { DataAccessScope } from "@/lib/data-access-scope";

const scope: DataAccessScope = { userId: "actor", role: "member", permissions: {}, teamId: "own", kind: "self", visibleUserIds: ["actor"], activeVisibleUserIds: ["actor"] };
function client(fail = false) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    profiles: [
      { id: "actor", team_id: "own", membership_status: "active" },
      { id: "archived", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "own" } },
      { id: "legacy", team_id: null, membership_status: "archived", archive_snapshot: {}, archived_by: "actor" },
      { id: "other", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "other" } },
    ],
    sub_topics: [{ id: "topic-archived", created_by: "archived", library_status: "in_library" }],
  };
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const result = (single = false) => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return { data: single ? rows[0] ?? null : rows, error: fail ? { message: "scope unavailable" } : null };
      };
      const query = {
        select: () => query,
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        order: () => query, range: () => query,
        maybeSingle: async () => result(true),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return pagedQueryDouble(query);
    },
  } as never;
}

test("19：历史选题范围复用归档团队快照，原团队能打开，其他团队仍不可见", async () => {
  const db = client();
  const teamScope = await loadTopicsTeamScope(db, scope, "own", "actor");
  assert.deepEqual(new Set(teamScope.visibleUserIds), new Set(["actor", "archived", "legacy"]));
  assert.deepEqual(teamScope.activeVisibleUserIds, ["actor"]);
  assert.equal((await loadSubTopicDetail(db, "topic-archived", "actor", teamScope)).ok, true);
  const other = await loadTopicsTeamScope(db, { ...scope, userId: "outsider" }, "other", "outsider");
  assert.equal((await loadSubTopicDetail(db, "topic-archived", "outsider", other)).ok, false);
  assert.deepEqual(await validateTopicForSubmission(db, "topic-archived", { userId: "actor", teamId: "own" }), { ok: true });
});

test("19：范围查询失败不能当作空团队成功", async () => {
  await assert.rejects(() => loadTopicsTeamScope(client(true), scope, "own", "actor"), /加载团队可见成员失败/);
});
