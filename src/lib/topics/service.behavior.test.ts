import test from "node:test";
import assert from "node:assert/strict";
import type { DataAccessScope } from "../data-access-scope";
import { selectLatest24hSnapshot, matchesPostFilters, validateSubTopicInput, validateRecommendationSubTopicInput, computeRecent7dHeat, filterTopicClaimsByScope } from "./domain";
import { startWritingClaim, cancelWritingClaim, loadRecent7dHeat } from "./data";

function createScope(kind: DataAccessScope["kind"] = "team", visibleUserIds = ["user-1"]) {
  return { userId: "user-1", role: "member", permissions: {}, accessLevel: 1, teamId: null, groupId: null, kind, visibleUserIds, activeVisibleUserIds: visibleUserIds } as DataAccessScope;
}

type FakeRow = Record<string, unknown>;

function createWritingFake(db: Record<string, FakeRow[]>) {
  function filterChain(rows: FakeRow[]) {
    const query: Record<string, unknown> = {
      eq: (col: string, val: unknown) => filterChain(rows.filter((row) => row[col] === val)),
      in: (col: string, vals: unknown[]) => filterChain(rows.filter((row) => vals.includes(row[col]))),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
      select: () => ({
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
      }),
      then: (resolve: (value: { data: FakeRow[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  }
  return {
    client: {
      from(table: string) {
        const rows = db[table] ?? (db[table] = []);
        return {
          select: () => filterChain([...rows]),
          insert: (payload: FakeRow) => {
            const inserted = { id: "claim-new", ...payload };
            return { select: () => ({ single: async () => { rows.push(inserted); return { data: inserted, error: null }; } }) };
          },
          update(patch: FakeRow) {
            const updateChain = (current: FakeRow[]): Record<string, unknown> => ({
              eq: (col: string, val: unknown) => updateChain(current.filter((row) => row[col] === val)),
              select: () => ({
                maybeSingle: async () => {
                  if (current[0]) Object.assign(current[0], patch);
                  return { data: current[0] ?? null, error: null };
                },
              }),
            });
            return updateChain([...rows]);
          },
        };
      },
    } as never,
  };
}

test("开始写作幂等：已有在写记录时直接返回，不新建", async () => {
  const db: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-1", created_by: "user-1", library_status: "in_library" }],
    sub_topic_claims: [{ id: "claim-1", sub_topic_id: "sub-1", user_id: "user-1", status: "writing" }],
  };
  const { client } = createWritingFake(db);

  const scope = { visibleUserIds: ["user-1"] };
  const first = await startWritingClaim(client, "user-1", "sub-1", scope);
  const second = await startWritingClaim(client, "user-1", "sub-1", scope);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(db.sub_topic_claims.length, 1);
});

test("开始写作只接受当前团队可见的选题，并保留多人写作与本人幂等", async () => {
  const startWithScope = startWritingClaim as unknown as (
    client: Parameters<typeof startWritingClaim>[0],
    userId: string,
    subTopicId: string,
    scope: { visibleUserIds: string[] },
  ) => ReturnType<typeof startWritingClaim>;

  const invisible: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-outsider", created_by: "team-b-owner", library_status: "in_library" }],
    sub_topic_claims: [],
  };
  const denied = await startWithScope(
    createWritingFake(invisible).client,
    "user-1",
    "sub-outsider",
    { visibleUserIds: ["user-1", "team-a-owner"] },
  );
  assert.equal(denied.ok, false);
  assert.equal(invisible.sub_topic_claims.length, 0, "不可见选题不能新增 claim");

  const visible: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-team-a", created_by: "team-a-owner", library_status: "in_library" }],
    sub_topic_claims: [],
  };
  const client = createWritingFake(visible).client;
  const scope = { visibleUserIds: ["user-1", "user-2", "team-a-owner"] };
  const first = await startWithScope(client, "user-1", "sub-team-a", scope);
  const retry = await startWithScope(client, "user-1", "sub-team-a", scope);
  const secondWriter = await startWithScope(client, "user-2", "sub-team-a", scope);

  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(secondWriter.ok, true, "另一位可见团队成员仍可同时写同一选题");
  assert.equal(visible.sub_topic_claims.length, 2);
  assert.deepEqual(visible.sub_topic_claims.map((row) => row.user_id).sort(), ["user-1", "user-2"]);
});

test("选题关联作品只取最新 24h 快照，不回退历史最大播放或 72h", () => {
  const latest = selectLatest24hSnapshot([
    { snapshot_type: "72h", captured_at: "2026-09-30T12:00:00Z", play_count: 99999 },
    { snapshot_type: "24h", captured_at: "2026-09-29T12:00:00Z", play_count: 12000 },
    { snapshot_type: "24h", captured_at: "2026-09-30T12:00:00Z", play_count: 8000 },
  ]);
  assert.equal(latest?.playCount, 8000);
  assert.equal(selectLatest24hSnapshot([{ snapshot_type: "72h", play_count: 50000 }]), undefined);
});

test("已移出选题不能开始写作；新成员开始写作正常落库", async () => {
  const removed: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-1", created_by: "user-1", library_status: "removed" }],
    sub_topic_claims: [],
  };
  const scope = { visibleUserIds: ["user-1"] };
  const removedResult = await startWritingClaim(createWritingFake(removed).client, "user-1", "sub-1", scope);
  assert.equal(removedResult.ok, false);
  if (!removedResult.ok) assert.equal(removedResult.status, 409);

  const fresh: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-2", created_by: "user-1", library_status: "in_library" }],
    sub_topic_claims: [],
  };
  const created = await startWritingClaim(createWritingFake(fresh).client, "user-1", "sub-2", scope);
  assert.equal(created.ok, true);
  assert.equal(fresh.sub_topic_claims.length, 1);
  assert.equal((fresh.sub_topic_claims[0] as FakeRow).status, "writing");
});

test("取消写作：只有 writing 能取消，cancelled/无记录时返回 404", async () => {
  const db: Record<string, FakeRow[]> = {
    sub_topic_claims: [
      { id: "claim-1", sub_topic_id: "sub-1", user_id: "user-1", status: "writing" },
      { id: "claim-2", sub_topic_id: "sub-2", user_id: "user-1", status: "cancelled" },
    ],
  };
  const { client } = createWritingFake(db);

  const ok = await cancelWritingClaim(client, "user-1", "sub-1");
  assert.equal(ok.ok, true);
  assert.equal((db.sub_topic_claims[0] as FakeRow).status, "cancelled");

  const missing = await cancelWritingClaim(client, "user-1", "sub-2");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);
});

test("「更多」后置过滤：近 7 天热度与历史成绩基于真实计算值执行", () => {
  const item = {
    recent7dParticipants: 0,
    recent7dCompletedCount: 0,
    recent7dInProgressCount: 0,
    summary: { bestPlayCount: 50000, qualifiedWorkCount: 1, averagePlayCount: 20000 },
  };
  assert.equal(matchesPostFilters(item, { recentHeat: "has_participants" }), false);
  assert.equal(matchesPostFilters(item, { recentHeat: "no_participants" }), true);
  assert.equal(matchesPostFilters(item, { performance: "high_qualified" }), true);
  assert.equal(matchesPostFilters(item, { performance: "high_best_play" }), false);
  assert.equal(matchesPostFilters(item, { performance: "high_avg_play" }), false);
  const hot = { ...item, recent7dParticipants: 3, recent7dCompletedCount: 2 };
  assert.equal(matchesPostFilters(hot, { recentHeat: "has_completed" }), true);
  assert.equal(matchesPostFilters(hot, { recentHeat: "has_in_progress" }), false);
});

test("选题写入拒绝超长文本，不能静默截断", () => {
  const overlongTitle = "选".repeat(121);
  const overlongHook = "钩".repeat(501);

  const titleResult = validateSubTopicInput({
    title: overlongTitle,
    hook: "正常钩子",
    topic_id: "topic-1",
  }, "create");
  assert.equal(titleResult.ok, false);
  if (!titleResult.ok) assert.match(titleResult.message, /title不能超过 120 个字符/);

  const hookResult = validateSubTopicInput({
    title: "正常标题",
    hook: overlongHook,
    topic_id: "topic-1",
  }, "create");
  assert.equal(hookResult.ok, false);
  if (!hookResult.ok) assert.match(hookResult.message, /hook不能超过 500 个字符/);

  const recommendationResult = validateRecommendationSubTopicInput({
    title: "正常标题",
    angle: overlongHook,
    category: "母题",
  });
  assert.equal(recommendationResult.ok, false);
  if (!recommendationResult.ok) assert.match(recommendationResult.message, /angle不能超过 500 个字符/);
});

test("七天热度口径：完成与在写分别计数，同一人并集去重", () => {
  const heat = computeRecent7dHeat(
    [
      { subTopicId: "sub-1", userId: "user-1" },
      { subTopicId: "sub-1", userId: "user-2" },
      { subTopicId: "sub-1", userId: "user-1" },
    ],
    [
      { subTopicId: "sub-1", userId: "user-2" },
      { subTopicId: "sub-1", userId: "user-3" },
    ],
  );
  assert.deepEqual(heat.get("sub-1"), {
    completedCount: 2,
    inProgressCount: 2,
    participants: 3,
  });
  assert.equal(heat.get("sub-none"), undefined);
});

test("超过 7 天但仍在 writing 的成员计入当前在写，不计入近 7 天热度", async () => {
  const rows: Record<string, FakeRow[]> = {
    videos: [],
    sub_topic_claims: [{
      id: "claim-old",
      sub_topic_id: "sub-1",
      user_id: "user-1",
      status: "writing",
      claimed_at: "2026-01-01T00:00:00.000Z",
    }],
  };
  const client = {
    from(table: string) {
      const makeQuery = (current: FakeRow[]) => {
        const query = {
          select() { return query; },
          eq(column: string, value: unknown) { return makeQuery(current.filter((row) => row[column] === value)); },
          gte(column: string, value: string) { return makeQuery(current.filter((row) => String(row[column] ?? "") >= value)); },
          in(column: string, values: unknown[]) { return makeQuery(current.filter((row) => values.includes(row[column]))); },
          or() { return query; },
          order() { return query; },
          async range(from: number, to: number) { return { data: current.slice(from, to + 1), error: null }; },
        };
        return query;
      };
      return makeQuery(rows[table] ?? []);
    },
  };

  const heat = await loadRecent7dHeat(client as never, ["sub-1"], createScope("self"));
  assert.deepEqual(heat.get("sub-1"), {
    completedCount: 0,
    inProgressCount: 0,
    participants: 0,
    currentWritingCount: 1,
  });
});

test("选题认领信息只返回当前业务可见成员", () => {
  const claims = [
    { id: "c1", user_id: "user-1", status: "candidate" },
    { id: "c2", user_id: "user-2", status: "scripting" },
  ];
  const scope = {
    kind: "self",
    visibleUserIds: ["user-1"],
  } as DataAccessScope;

  assert.deepEqual(filterTopicClaimsByScope(claims, scope), [claims[0]]);
});

