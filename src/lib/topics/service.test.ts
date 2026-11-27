import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DataAccessScope } from "../data-access-scope";

import { buildMyClaim, buildPoolQueryOptions, calculateTopicWorkSummary, computeRecent7dHeat, sortTopicPoolItems, filterTopicClaimsByScope, matchesPostFilters, rankSuggestedSubTopics, selectLatest24hSnapshot, validateRecommendationSubTopicInput, validateSubTopicInput } from "./domain";
import { cancelWritingClaim, loadActiveTopics, loadTopicLibraryBootstrap, loadTopicOptions, loadRecent7dHeat, startWritingClaim } from "./data";
import { matchTopicGroup } from "./group-matching";
import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "./metrics";

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

test("【结构契约】topics service 达标阈值只引用共享常量，防止 30000 硬编码回潮", () => {
  // 这一条是源码级结构契约，不是行为测试：把 30000 写死与引用共享常量在运行时完全等价，
  // 任何输入/输出断言都区分不出来，删掉它就等于失去防回潮能力。
  // 阈值的行为侧另有覆盖——本文件 calculateTopicWorkSummary 的 29999/30000 边界用例。
  // B02 领域/数据锚点：阈值常量已随拆分迁入三处，断言内容保持不变。
  const source = [
    readFileSync(resolve(process.cwd(), "src/lib/topics/domain/ranking.ts"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/lib/topics/domain/query-options.ts"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/lib/topics/data/pool-scored.ts"), "utf8"),
  ].join("\n");
  assert.equal(TOPIC_LIBRARY_QUALIFY_PLAY_COUNT, 30_000);
  assert.doesNotMatch(source, />=\s*30_000/);
  assert.doesNotMatch(source, />=\s*30000/);
  assert.match(source, /TOPIC_LIBRARY_QUALIFY_PLAY_COUNT/);

  // 行为侧锁定：达标判定确实以共享常量为界（差 1 条不达标、恰好达标计 1 条）。
  const below = calculateTopicWorkSummary([
    { playCount: TOPIC_LIBRARY_QUALIFY_PLAY_COUNT - 1, content: "差 1 条", uploadedAt: "2026-07-01T00:00:00.000Z" },
  ]);
  const at = calculateTopicWorkSummary([
    { playCount: TOPIC_LIBRARY_QUALIFY_PLAY_COUNT, content: "恰好达标", uploadedAt: "2026-07-01T00:00:00.000Z" },
  ]);
  assert.equal(below.qualifiedWorkCount, 0);
  assert.equal(at.qualifiedWorkCount, 1);
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

class FakeQuery {
  calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(
    readonly table: string,
    private readonly result: { data?: unknown; error?: unknown; count?: number },
  ) {}

  select(...args: unknown[]) {
    this.calls.push({ method: "select", args });
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push({ method: "order", args });
    return this;
  }

  range(...args: unknown[]) {
    this.calls.push({ method: "range", args });
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push({ method: "eq", args });
    return this;
  }

  neq(...args: unknown[]) {
    this.calls.push({ method: "neq", args });
    return this;
  }

  gte(...args: unknown[]) {
    this.calls.push({ method: "gte", args });
    return this;
  }

  in(...args: unknown[]) {
    this.calls.push({ method: "in", args });
    return this;
  }

  or(...args: unknown[]) {
    this.calls.push({ method: "or", args });
    return this;
  }

  then<TResult1 = { data?: unknown; error?: unknown; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data?: unknown; error?: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function createFakeSupabase(results: Record<string, Array<{ data?: unknown; error?: unknown; count?: number }>>) {
  const queries: FakeQuery[] = [];
  return {
    queries,
    client: {
      from(table: string) {
        const result = results[table]?.shift();
        if (!result) throw new Error(`Missing fake result for ${table}`);
        const query = new FakeQuery(table, result);
        queries.push(query);
        return query;
      },
    },
  };
}

function createScope(kind: DataAccessScope["kind"] = "team", visibleUserIds = ["user-1"]) {
  return { userId: "user-1", role: "member", permissions: {}, accessLevel: 1, teamId: null, groupId: null, kind, visibleUserIds, activeVisibleUserIds: visibleUserIds } as DataAccessScope;
}

test("团队动态的最近成片明确使用视频 topic_id 关系，避免 Supabase 关系歧义", async () => {
  const selectCalls: Array<{ table: string; columns: string }> = [];
  const client = {
    from(table: string) {
      const result = table === "sub_topic_claims"
        ? { data: [], error: null }
        : { data: [{ id: "video-1", topic_id: "sub-1", user_id: "user-1", video_title: "成片一", uploaded_at: "2026-08-30T00:00:00.000Z", sub_topics: { id: "sub-1", title: "选题一", library_status: "in_library" } }], error: null };
      const query = {
        select(columns: string) {
          selectCalls.push({ table, columns });
          if (table === "videos" && columns.includes("sub_topics(") && !columns.includes("sub_topics!videos_topic_id_fkey(")) {
            return {
              eq: () => query,
              not: () => query,
              order: () => query,
              limit: () => query,
              in: () => query,
              then: (resolve: (value: { data: null; error: { message: string } }) => unknown) => Promise.resolve({
                data: null,
                error: { message: "Could not embed because more than one relationship was found for 'videos' and 'sub_topics'" },
              }).then(resolve),
            };
          }
          return query;
        },
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        in: () => query,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  };

  const result = await loadActiveTopics(client as never, "user-1", createScope(), 8);

  assert.equal(result.ok, true);
  assert.equal(selectCalls.find((call) => call.table === "videos")?.columns.includes("sub_topics!videos_topic_id_fkey("), true);
});

test("选题库首屏聚合读取返回动态、母题、选题池和当前在写题目 ID", async () => {
  const calls: string[] = [];
  const fake = {
    from(table: string) {
      calls.push(table);
      const query = {
        select() { return query; },
        eq() { return query; },
        not() { return query; },
        order() { return query; },
        limit() { return query; },
        in() { return query; },
        gte() { return query; },
        then<TResult1 = { data: unknown[]; error: null }>(
          onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        ) {
          return Promise.resolve({ data: [], error: null }).then(onfulfilled);
        },
      };
      return query;
    },
  };

  const result = await loadTopicLibraryBootstrap(
    fake as never,
    "user-1",
    createScope(),
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      active: { recentlyClaimed: [], recentlyWorked: [] },
      options: { topics: [] },
      pool: { items: [], pagination: { page: 1, pageSize: 50, totalItems: 0 } },
      myWritingTopicIds: [],
      currentUserId: "user-1",
    },
  });
  assert.ok(calls.includes("topics"));
  assert.ok(calls.includes("sub_topics"));
  assert.ok(calls.filter((table) => table === "videos").length >= 1);
  assert.ok(calls.filter((table) => table === "sub_topic_claims").length >= 2);
});

test("myClaim 只选择当前用户的有效认领，不从团队第一条认领猜测", () => {
  const rows = [
    { id: "claim-other", sub_topic_id: "sub-1", user_id: "user-2", status: "writing", claimed_at: "2026-08-01T00:00:00.000Z" },
    { id: "claim-me", sub_topic_id: "sub-1", user_id: "user-1", status: "writing", claimed_at: null },
  ];

  assert.deepEqual(buildMyClaim(rows, "user-1", "sub-1"), {
    id: "claim-me",
    subTopicId: "sub-1",
    status: "writing",
    claimedAt: null,
  });
  assert.equal(buildMyClaim(rows, "user-3", "sub-1"), null);
});

test("选题池排序作用于完整结果集且空 Hook 不会让搜索崩溃", () => {
  const items = [
    { id: "old", title: "旧选题", hook: null, created_at: "2026-07-01T00:00:00.000Z", claimCount: 5, recent7dParticipants: 5, summary: { averagePlayCount: 1000 } },
    { id: "new", title: "新选题", hook: "突破信号", created_at: "2026-08-01T00:00:00.000Z", claimCount: 1, recent7dParticipants: 1, summary: { averagePlayCount: 2000, bestPlayCount: 50000 } },
  ];

  assert.deepEqual(sortTopicPoolItems(items, "latest").map((item) => item.id), ["new", "old"]);
  assert.deepEqual(sortTopicPoolItems(items, "avg_play").map((item) => item.id), ["new", "old"]);
  assert.deepEqual(sortTopicPoolItems(items, "best_play").map((item) => item.id), ["new", "old"]);
  assert.deepEqual(sortTopicPoolItems(items, "recent_heat").map((item) => item.id), ["old", "new"]);
});

test("母题 options 按 sort_order 返回完整列表", async () => {
  const fake = createFakeSupabase({
    topics: [{
      data: [
        { id: "topic-2", name: "第二母题", sort_order: 20 },
        { id: "topic-1", name: "第一母题", sort_order: 10 },
        { id: "topic-empty", name: "", sort_order: 30 },
      ],
    }],
  });

  const result = await loadTopicOptions(fake.client as never);

  assert.deepEqual(result, {
    ok: true,
    value: {
      topics: [
        { id: "topic-1", name: "第一母题" },
        { id: "topic-2", name: "第二母题" },
      ],
    },
  });
  assert.deepEqual(fake.queries[0]?.calls.find((call) => call.method === "order")?.args, ["sort_order", { ascending: true }]);
});

test("手动录入选题允许不填写钩子", () => {
  assert.deepEqual(
    validateSubTopicInput(
      {
        title: "只填标题也能录入",
        hook: null,
        topic_id: "123e4567-e89b-12d3-a456-426614174001",
        source: "manual",
      },
      "create",
    ),
    {
      ok: true,
      value: {
        title: "只填标题也能录入",
        hook: null,
        topicId: "123e4567-e89b-12d3-a456-426614174001",
        emotionTag: null,
        source: "manual",
        audience: null,
      },
    },
  );
});

test("分组自动归类优先匹配分组名和关键词", () => {
  const groups = [
    { id: "group-a", name: "图形战法" },
    { id: "group-b", name: "热点二阶思维" },
    { id: "group-c", name: "空仓艺术" },
  ];

  assert.equal(matchTopicGroup(groups, "龙头图形战法复盘", "突破后的止盈方法"), "group-a");
  assert.equal(matchTopicGroup(groups, "突发政策怎么看", "热点二阶思维拆解"), "group-b");
  assert.equal(matchTopicGroup(groups, "没有明确分类", "纯聊天"), null);
});

test("选题推荐按标题和文案相似度返回前三个", () => {
  const suggestions = rankSuggestedSubTopics(
    [
      { id: "sub-1", title: "龙头股分歧转一致", hook: "用盘口判断龙头什么时候接力", topicName: "暴力战法类", groupName: "龙头选股" },
      { id: "sub-2", title: "政策热点精读", hook: "三分钟看懂政策对板块的影响", topicName: "热点/新闻解读类", groupName: "政策精读" },
      { id: "sub-3", title: "空仓也是交易", hook: "情绪退潮期如何管住手", topicName: "情绪周期类", groupName: "空仓艺术" },
      { id: "sub-4", title: "主力资金生态", hook: "站在资金角度理解市场", topicName: "降维认知类", groupName: "资金生态" },
    ],
    { title: "龙头接力", content: "盘口分歧后怎么判断龙头股还能不能接力" },
  );

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0]?.id, "sub-1");
  assert.ok((suggestions[0]?.score ?? 0) > (suggestions[1]?.score ?? 0));
});

test("选题池参数只接受约定视图和时间范围", () => {
  assert.deepEqual(buildPoolQueryOptions(new URLSearchParams("view=my_claims&time_range=1w&topic_id=123e4567-e89b-12d3-a456-426614174001")), {
    ok: true,
    options: {
      view: "my_claims",
      timeRange: "1w",
      topicIds: ["123e4567-e89b-12d3-a456-426614174001"],
      page: 1,
      pageSize: 50,
    },
  });

  assert.deepEqual(buildPoolQueryOptions(new URLSearchParams("view=my_claims&time_range=1w&topic_id=123e4567-e89b-12d3-a456-426614174001&topic_id=123e4567-e89b-12d3-a456-426614174002")), {
    ok: true,
    options: {
      view: "my_claims",
      timeRange: "1w",
      topicIds: ["123e4567-e89b-12d3-a456-426614174001", "123e4567-e89b-12d3-a456-426614174002"],
      page: 1,
      pageSize: 50,
    },
  });

  assert.deepEqual(buildPoolQueryOptions(new URLSearchParams("view=bad")), {
    ok: false,
    status: 400,
    message: "view 只能是 all、my_claims、my_created、trending、high_potential 或 never_worked",
  });

  assert.deepEqual(buildPoolQueryOptions(new URLSearchParams("topic_id=not-a-uuid")), {
    ok: false,
    status: 400,
    message: "topic_id 格式不正确",
  });

  for (const view of ["trending", "high_potential", "never_worked"]) {
    assert.equal(buildPoolQueryOptions(new URLSearchParams(`view=${view}`)).ok, true);
  }
});
