import test from "node:test";
import assert from "node:assert/strict";
import type { DataAccessScope } from "../data-access-scope";

import {
  buildClaimActivity,
  buildMyClaim,
  buildTopicComparisonQueryOptions,
  buildTopicComparisonRows,
  buildPoolQueryOptions,
  computeRecent7dHeat,
  sortTopicPoolItems,
  calculateTopicWorkSummary,
  cancelWritingClaim,
  deleteSubTopic,
  filterTopicClaimsByScope,
  loadTopicPool,
  loadTopicOptions,
  matchTopicGroup,
  rankSuggestedSubTopics,
  startWritingClaim,
  validateRecommendationSubTopicInput,
  validateSubTopicInput,
  type ApiFailure,
} from "./service";

type FakeRow = Record<string, unknown>;

function createWritingFake(db: Record<string, FakeRow[]>) {
  function filterChain(rows: FakeRow[]) {
    const query: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        return filterChain(rows.filter((row) => row[col] === val));
      },
      in(col: string, vals: unknown[]) {
        return filterChain(rows.filter((row) => vals.includes(row[col])));
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
      select(_columns?: string) {
        return {
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
        };
      },
      then(resolve: (value: { data: FakeRow[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  }

  return {
    client: {
      from(table: string) {
        const rows = db[table] ?? (db[table] = []);
        return {
          select(_columns?: string) {
            return filterChain([...rows]);
          },
          insert(payload: FakeRow) {
            const inserted = { id: "claim-new", ...payload };
            return {
              select(_columns?: string) {
                return {
                  single: async () => {
                    rows.push(inserted);
                    return { data: inserted, error: null };
                  },
                };
              },
            };
          },
          update(patch: FakeRow) {
            function updateChain(current: FakeRow[]): Record<string, unknown> {
              return {
                eq(col: string, val: unknown) {
                  return updateChain(current.filter((row) => row[col] === val));
                },
                select(_columns?: string) {
                  return {
                    maybeSingle: async () => {
                      if (current[0]) Object.assign(current[0], patch);
                      return { data: current[0] ?? null, error: null };
                    },
                  };
                },
              };
            }
            return updateChain([...rows]);
          },
        };
      },
    } as never,
  };
}

test("开始写作幂等：已有在写记录时直接返回，不新建", async () => {
  const db: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-1", library_status: "in_library" }],
    sub_topic_claims: [{ id: "claim-1", sub_topic_id: "sub-1", user_id: "user-1", status: "writing" }],
  };
  const { client } = createWritingFake(db);

  const first = await startWritingClaim(client, "user-1", "sub-1");
  const second = await startWritingClaim(client, "user-1", "sub-1");
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(db.sub_topic_claims.length, 1);
});

test("已移出选题不能开始写作；新成员开始写作正常落库", async () => {
  const removed: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-1", library_status: "removed" }],
    sub_topic_claims: [],
  };
  const removedResult = await startWritingClaim(createWritingFake(removed).client, "user-1", "sub-1");
  assert.equal(removedResult.ok, false);
  if (!removedResult.ok) assert.equal(removedResult.status, 409);

  const fresh: Record<string, FakeRow[]> = {
    sub_topics: [{ id: "sub-2", library_status: "in_library" }],
    sub_topic_claims: [],
  };
  const created = await startWritingClaim(createWritingFake(fresh).client, "user-1", "sub-2");
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

function createScope(kind: DataAccessScope["kind"] = "all", visibleUserIds = ["user-1"]) {
  return {
    userId: "user-1",
    role: kind === "all" ? "owner" : "member",
    permissions: {},
    accessLevel: kind === "all" ? 4 : 1,
    teamId: null,
    groupId: null,
    kind,
    visibleUserIds,
  } as DataAccessScope;
}

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

test("近期高热只保留 30 天内作品，按综合分排序并沿用分类与权限筛选", async () => {
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const topicId = "123e4567-e89b-12d3-a456-426614174001";
  const fake = createFakeSupabase({
    sub_topics: [{
      data: [
        { id: "sub-hot", topic_id: topicId, title: "近三天高播放", sub_topic_claims: [] },
        { id: "sub-warm", topic_id: topicId, title: "一周内中播放", sub_topic_claims: [] },
        { id: "sub-old", topic_id: topicId, title: "三十天外", sub_topic_claims: [] },
      ],
    }],
    sub_topic_claims: [{ data: [] }],
    videos: [
      { data: [] },
      { data: [
        { topic_id: "sub-hot", user_id: "user-1", uploaded_at: daysAgo(2), video_metrics_snapshots: [{ play_count: 200_000 }] },
        { topic_id: "sub-warm", user_id: "user-1", uploaded_at: daysAgo(6), video_metrics_snapshots: [{ play_count: 50_000 }] },
        { topic_id: "sub-old", user_id: "user-1", uploaded_at: daysAgo(31), video_metrics_snapshots: [{ play_count: 500_000 }] },
      ] },
      { data: [] },
    ],
  });

  const result = await loadTopicPool(
    fake.client as never,
    "user-1",
    createScope("self"),
    { view: "trending", timeRange: "1m", page: 1, pageSize: 20, topicIds: [topicId] },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as { items: Array<Record<string, unknown>>; pagination: Record<string, number> };
  assert.deepEqual(value.items.map((item) => item.id), ["sub-hot", "sub-warm"]);
  assert.deepEqual(value.items.map((item) => item._score), [1, 0.7]);
  assert.deepEqual(value.pagination, { page: 1, pageSize: 20, totalItems: 2 });

  const subTopicsQuery = fake.queries.find((query) => query.table === "sub_topics");
  const worksIn = fake.queries
    .filter((query) => query.table === "videos")
    .flatMap((query) => query.calls)
    .find((call) => call.method === "in" && call.args[0] === "user_id");
  assert.deepEqual(subTopicsQuery?.calls.find((call) => call.method === "in")?.args, ["topic_id", [topicId]]);
  assert.deepEqual(worksIn?.args, ["user_id", ["user-1"]]);
});

test("高潜待挖只保留 30 天外作品，同等播放量时沉睡越久越靠前", async () => {
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const fake = createFakeSupabase({
    sub_topics: [{
      data: [
        { id: "sub-40", title: "四十天未做", sub_topic_claims: [] },
        { id: "sub-70", title: "七十天未做", sub_topic_claims: [] },
        { id: "sub-recent", title: "刚做过", sub_topic_claims: [] },
      ],
    }],
    sub_topic_claims: [{ data: [] }],
    videos: [
      { data: [] },
      { data: [
        { topic_id: "sub-40", user_id: "user-1", uploaded_at: daysAgo(40), video_metrics_snapshots: [{ play_count: 100_000 }] },
        { topic_id: "sub-70", user_id: "user-1", uploaded_at: daysAgo(70), video_metrics_snapshots: [{ play_count: 100_000 }] },
        { topic_id: "sub-recent", user_id: "user-1", uploaded_at: daysAgo(3), video_metrics_snapshots: [{ play_count: 100_000 }] },
      ] },
      { data: [] },
    ],
  });

  const result = await loadTopicPool(
    fake.client as never,
    "user-1",
    createScope(),
    { view: "high_potential", timeRange: "1m", page: 1, pageSize: 1, topicIds: [] },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as { items: Array<Record<string, unknown>>; pagination: Record<string, number> };
  assert.deepEqual(value.items.map((item) => item.id), ["sub-70"]);
  assert.equal(value.items[0]?._score, 0.9);
  assert.deepEqual(value.pagination, { page: 1, pageSize: 1, totalItems: 2 });
});

test("从未做过按当前可见范围排除已有作品，并在过滤后分页", async () => {
  const fake = createFakeSupabase({
    sub_topic_claims: [{ data: [] }],
    videos: [{ data: [] }, { data: [{ topic_id: "sub-worked", user_id: "user-1" }] }],
    sub_topics: [{
      data: [
        { id: "sub-worked", title: "已经做过", created_at: "2026-07-30T03:00:00.000Z", sub_topic_claims: [] },
        { id: "sub-newest", title: "最新未做", created_at: "2026-07-30T02:00:00.000Z", sub_topic_claims: [] },
        { id: "sub-older", title: "较早未做", created_at: "2026-07-30T01:00:00.000Z", sub_topic_claims: [] },
      ],
    }],
  });

  const result = await loadTopicPool(
    fake.client as never,
    "user-1",
    createScope("self"),
    { view: "never_worked", timeRange: "1m", page: 2, pageSize: 1, topicIds: [] },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as { items: Array<Record<string, unknown>>; pagination: Record<string, number> };
  assert.deepEqual(value.items.map((item) => item.id), ["sub-older"]);
  assert.equal(value.items[0]?._daysSinceLastWork, null);
  assert.equal(value.items[0]?._avgPlayCount, null);
  assert.deepEqual(value.pagination, { page: 2, pageSize: 1, totalItems: 2 });

  const worksIn = fake.queries
    .filter((query) => query.table === "videos")
    .flatMap((query) => query.calls)
    .find((call) => call.method === "in" && call.args[0] === "user_id");
  assert.deepEqual(worksIn?.args, ["user_id", ["user-1"]]);
});

test("我的认领视图按有效认领 id 在数据库层过滤，不按子题创建时间过滤", async () => {
  const fake = createFakeSupabase({
    sub_topics: [
      {
        data: [
          {
            id: "sub-old",
            title: "很早创建但仍在认领的选题",
            sub_topic_claims: [{ id: "claim-1", sub_topic_id: "sub-old", user_id: "user-1", status: "writing", claimed_at: "2026-01-01T00:00:00.000Z" }],
          },
        ],
        count: 1,
      },
    ],
    sub_topic_claims: [
      { data: [{ id: "claim-1", sub_topic_id: "sub-old", user_id: "user-1", status: "writing", claimed_at: "2026-01-01T00:00:00.000Z" }] },
      { data: [] },
    ],
    videos: [{ data: [] }, { data: [] }],
  });

  const result = await loadTopicPool(
    fake.client as never,
    "user-1",
    {
      userId: "user-1",
      role: "owner",
      permissions: {},
      accessLevel: 4,
      teamId: null,
      groupId: null,
      kind: "all",
      visibleUserIds: ["user-1"],
    } as DataAccessScope,
    { view: "my_claims", timeRange: "3d", page: 1, pageSize: 50, topicIds: [] },
  );

  assert.equal(result.ok, true);
  const subTopicsQuery = fake.queries.find((query) => query.table === "sub_topics");
  assert.ok(subTopicsQuery);
  assert.deepEqual(subTopicsQuery.calls.find((call) => call.method === "in")?.args, ["id", ["sub-old"]]);
  assert.equal(subTopicsQuery.calls.some((call) => call.method === "gte" && call.args[0] === "created_at"), false);
  assert.deepEqual(result.value, {
    items: [
      {
        id: "sub-old",
        title: "很早创建但仍在认领的选题",
        sub_topic_claims: [{ id: "claim-1", sub_topic_id: "sub-old", user_id: "user-1", status: "writing", claimed_at: "2026-01-01T00:00:00.000Z" }],
        summary: { qualifiedWorkCount: 0, averagePlayCount: null, bestPlayCount: null, bestCopy: null, latestCopy: null },
        externalMetrics: null,
        claimCount: 1,
        candidateCount: 1,
        scriptingCount: 1,
        inProgressCount: 1,
        isWritingByMe: true,
        recent7dCompletedCount: 0,
        recent7dInProgressCount: 0,
        recent7dParticipants: 0,
        myClaim: {
          id: "claim-1",
          subTopicId: "sub-old",
          status: "writing",
          claimedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ],
    pagination: { page: 1, pageSize: 50, totalItems: 1 },
  });
});

test("子题汇总只统计播放量不低于 3 万的作品", () => {
  const summary = calculateTopicWorkSummary([
    { playCount: 29999, content: "低流量", uploadedAt: "2026-07-01T00:00:00.000Z" },
    { playCount: 30000, content: "达标文案", uploadedAt: "2026-07-02T00:00:00.000Z" },
    { playCount: 50000, content: "更好文案", uploadedAt: "2026-07-03T00:00:00.000Z" },
  ]);

  assert.equal(summary.qualifiedWorkCount, 2);
  assert.equal(summary.averagePlayCount, 40000);
  assert.equal(summary.bestPlayCount, 50000);
  assert.equal(summary.bestCopy, "更好文案");
  assert.equal(summary.latestCopy, "更好文案");
});

test("写作动态只统计 writing 并隐藏范围外身份，旧键统一为在写人数", () => {
  const result = buildClaimActivity(
    [
      { user_id: "user-1", status: "writing", claimed_at: "2026-07-20T08:00:00.000Z", profiles: { name: "小王" } },
      { user_id: "user-2", status: "writing", claimed_at: "2026-07-21T08:00:00.000Z", profiles: { name: "小李" } },
      { user_id: "user-3", status: "writing", claimed_at: "2026-07-22T08:00:00.000Z", profiles: { name: "小周" } },
      { user_id: "user-4", status: "cancelled", claimed_at: "2026-07-23T08:00:00.000Z", profiles: { name: "小钱" } },
    ],
    { kind: "self", visibleUserIds: ["user-1", "user-2"] } as DataAccessScope,
  );

  assert.equal(result.inProgressCount, 3);
  assert.equal(result.candidateCount, 3);
  assert.equal(result.scriptingCount, 3);
  assert.deepEqual(result.claims, [
    { userId: "user-2", displayName: "小李", status: "writing", claimedAt: "2026-07-21T08:00:00.000Z" },
    { userId: "user-1", displayName: "小王", status: "writing", claimedAt: "2026-07-20T08:00:00.000Z" },
  ]);
});

test("横向对比按账号和母题聚合，按达标率排序并标记小样本", () => {
  const rows = buildTopicComparisonRows(
    [
      { topicId: "topic-1", topicName: "美妆", accountId: "account-1", accountName: "A号", playCount: 30000 },
      { topicId: "topic-1", topicName: "美妆", accountId: "account-1", accountName: "A号", playCount: 50000 },
      { topicId: "topic-1", topicName: "美妆", accountId: "account-2", accountName: "B号", playCount: 29999 },
      { topicId: "topic-2", topicName: "穿搭", accountId: "account-1", accountName: "A号", playCount: 35000 },
    ],
    "account",
  );

  assert.deepEqual(rows, [
    {
      topicId: "topic-1",
      topicName: "美妆",
      accountId: "account-1",
      accountName: "A号",
      workCount: 2,
      qualifiedCount: 2,
      qualifiedRate: 1,
      avgPlayCount: 40000,
      bestPlayCount: 50000,
      lowConfidence: true,
    },
    {
      topicId: "topic-2",
      topicName: "穿搭",
      accountId: "account-1",
      accountName: "A号",
      workCount: 1,
      qualifiedCount: 1,
      qualifiedRate: 1,
      avgPlayCount: 35000,
      bestPlayCount: 35000,
      lowConfidence: true,
    },
    {
      topicId: "topic-1",
      topicName: "美妆",
      accountId: "account-2",
      accountName: "B号",
      workCount: 1,
      qualifiedCount: 0,
      qualifiedRate: 0,
      avgPlayCount: 29999,
      bestPlayCount: 29999,
      lowConfidence: true,
    },
  ]);
});

test("横向对比参数只接受两种维度、有效天数和合法母题 ID", () => {
  assert.deepEqual(buildTopicComparisonQueryOptions(new URLSearchParams()), {
    ok: true,
    options: { dimension: "topic", days: 30, topicId: null },
  });
  assert.deepEqual(buildTopicComparisonQueryOptions(new URLSearchParams("dimension=video")), {
    ok: false,
    status: 400,
    message: "dimension 只能是 topic 或 account",
  });
  assert.deepEqual(buildTopicComparisonQueryOptions(new URLSearchParams("days=0")), {
    ok: false,
    status: 400,
    message: "days 必须是 1 到 90 之间的整数",
  });
});

test("采纳 AI 建议要求标题和切入角度，并保留可选分类和标签", () => {
  assert.deepEqual(validateRecommendationSubTopicInput({ title: "AI 选题", angle: "从反差切入", category: "常规母题", emotion_tag: "紧迫", audience: "新手" }), {
    ok: true,
    value: {
      title: "AI 选题",
      hook: "从反差切入",
      category: "常规母题",
      emotionTag: "紧迫",
      audience: "新手",
    },
  });
  assert.deepEqual(validateRecommendationSubTopicInput({ title: "AI 选题" }), {
    ok: false,
    status: 400,
    message: "angle 为必填项",
  });
});

test("deleteSubTopic 409 响应包含 work_count", async () => {
  const client = {
    from(table: string) {
      if (table === "sub_topics") {
        let selectMode = true;
        const builder = {
          select() { return builder; },
          eq(_col: string, _val: unknown) { // eslint-disable-line @typescript-eslint/no-unused-vars
            if (selectMode) return builder;
            return { error: null };
          },
          delete() {
            selectMode = false;
            return builder;
          },
          async maybeSingle() {
            return { data: { id: "sub-1", created_by: "user-1" }, error: null };
          },
        };
        return builder;
      }
      if (table === "videos") {
        return {
          select(_cols: string, _opts?: unknown) { // eslint-disable-line @typescript-eslint/no-unused-vars
            return {
              eq() {
                return {
                  eq() {
                    return { count: 3, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  const result = await deleteSubTopic(client as never, "user-1", "sub-1");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal((result as ApiFailure).work_count, 3);
    assert.match(result.message, /已有作品关联/);
  }
});
