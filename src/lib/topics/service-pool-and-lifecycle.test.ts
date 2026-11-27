import test from "node:test";
import assert from "node:assert/strict";
import type { DataAccessScope } from "../data-access-scope";

import {
  buildClaimActivity,
  calculateTopicWorkSummary,
  validateRecommendationSubTopicInput,
} from "./domain";
import {
  loadTopicPool,
  loadTopicPoolWorkAggregates,
  removeSubTopic,
} from "./data";

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
        { topic_id: "sub-hot", user_id: "user-1", published_at: daysAgo(2), uploaded_at: daysAgo(2), video_metrics_snapshots: [{ play_count: 200_000 }] },
        { topic_id: "sub-warm", user_id: "user-1", published_at: daysAgo(6), uploaded_at: daysAgo(6), video_metrics_snapshots: [{ play_count: 50_000 }] },
        { topic_id: "sub-old", user_id: "user-1", published_at: daysAgo(31), uploaded_at: daysAgo(31), video_metrics_snapshots: [{ play_count: 500_000 }] },
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
  assert.deepEqual(
    subTopicsQuery?.calls.find((call) => call.method === "in" && call.args[0] === "topic_id")?.args,
    ["topic_id", [topicId]],
  );
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
        { topic_id: "sub-40", user_id: "user-1", published_at: daysAgo(40), uploaded_at: daysAgo(40), video_metrics_snapshots: [{ play_count: 100_000 }] },
        { topic_id: "sub-70", user_id: "user-1", published_at: daysAgo(70), uploaded_at: daysAgo(70), video_metrics_snapshots: [{ play_count: 100_000 }] },
        { topic_id: "sub-recent", user_id: "user-1", published_at: daysAgo(3), uploaded_at: daysAgo(3), video_metrics_snapshots: [{ play_count: 100_000 }] },
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

test("无发布日的存量作品按上传日参与「最近出片」判断", async () => {
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const fake = createFakeSupabase({
    sub_topics: [{
      data: [{ id: "sub-legacy", title: "只有上传日的存量作品", sub_topic_claims: [] }],
    }],
    sub_topic_claims: [{ data: [] }],
    videos: [
      { data: [] },
      { data: [
        { topic_id: "sub-legacy", user_id: "user-1", published_at: null, uploaded_at: daysAgo(3), video_metrics_snapshots: [{ play_count: 100_000 }] },
      ] },
      { data: [] },
    ],
  });

  const result = await loadTopicPool(
    fake.client as never,
    "user-1",
    createScope(),
    { view: "high_potential", timeRange: "1m", page: 1, pageSize: 10, topicIds: [] },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as { items: Array<Record<string, unknown>> };
  // 上传日 3 天前 ⇒ 回退口径下算「近期出片」，不进入「30 天外」的高潜列表
  assert.deepEqual(value.items.map((item) => item.id), []);
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
    { userId: "user-1", role: "owner", permissions: {}, accessLevel: 4, teamId: null, groupId: null, kind: "team", visibleUserIds: ["user-1"], activeVisibleUserIds: ["user-1"] } as DataAccessScope,
    { view: "my_claims", timeRange: "3d", page: 1, pageSize: 50, topicIds: [] },
  );

  assert.equal(result.ok, true);
  const subTopicsQuery = fake.queries.find((query) => query.table === "sub_topics");
  assert.ok(subTopicsQuery);
  assert.deepEqual(
    subTopicsQuery.calls.find((call) => call.method === "in" && call.args[0] === "id")?.args,
    ["id", ["sub-old"]],
  );
  assert.equal(subTopicsQuery.calls.some((call) => call.method === "gte" && call.args[0] === "created_at"), false);
  assert.deepEqual(result.value, {
    items: [
      {
        id: "sub-old",
        title: "很早创建但仍在认领的选题",
        sub_topic_claims: [{ id: "claim-1", sub_topic_id: "sub-old", user_id: "user-1", status: "writing", claimed_at: "2026-01-01T00:00:00.000Z" }],
        summary: { qualifiedWorkCount: 0, averagePlayCount: null, bestPlayCount: null, bestCopy: null, latestCopy: null, latestPublishedAt: null },
        externalMetrics: null,
        claimCount: 1,
        currentWritingCount: 1,
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

test("子题汇总最高播放取全部作品，达标文案仍只取不低于 3 万的作品", () => {
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

test("全部作品未达标时仍返回真实最高播放，达标文案保持为空", () => {
  const summary = calculateTopicWorkSummary([
    { playCount: 8000, content: "较低作品", uploadedAt: "2026-07-01T00:00:00.000Z" },
    { playCount: 29999, content: "最高但未达标", uploadedAt: "2026-07-02T00:00:00.000Z" },
  ]);

  assert.equal(summary.qualifiedWorkCount, 0);
  assert.equal(summary.averagePlayCount, null);
  assert.equal(summary.bestPlayCount, 29999);
  assert.equal(summary.bestCopy, null);
  assert.equal(summary.latestCopy, null);
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

test("removeSubTopic 只走原子软移出，不查询或删除关联作品", async () => {
  const subTopicId = "123e4567-e89b-42d3-a456-426614174010";
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      if (table === "sub_topics") {
        const selectMode = true;
        const builder = {
          select() { return builder; },
          eq(_col: string, _val: unknown) { // eslint-disable-line @typescript-eslint/no-unused-vars
            if (selectMode) return builder;
            return { error: null };
          },
          async maybeSingle() {
            return { data: { id: subTopicId, created_by: "user-1", topic_id: "123e4567-e89b-42d3-a456-426614174011" }, error: null };
          },
        };
        return builder;
      }
      throw new Error(`unexpected table: ${table}`);
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      return { data: { id: subTopicId, library_status: "removed" }, error: null };
    },
  };

  const result = await removeSubTopic(client as never, {
    actorId: "user-1",
    teamId: "123e4567-e89b-42d3-a456-426614174099",
    canReviewContent: false,
  }, subTopicId);

  assert.deepEqual(result, { ok: true, value: { removed: true } });
  assert.deepEqual(rpcCalls, [{
    fn: "toggle_topic_library_atomic",
    params: { p_sub_topic_id: subTopicId, p_action: "remove", p_actor_id: "user-1" },
  }]);
});

test("同团队具权管理员可软移出，跨团队管理员直接 403", async () => {
  const subTopicId = "123e4567-e89b-42d3-a456-426614174020";
  const makeClient = (creatorTeamId: string) => {
    let rpcCount = 0;
    const client = {
      from(table: string) {
        const data = table === "sub_topics"
          ? { id: subTopicId, created_by: "creator-1", topic_id: "123e4567-e89b-42d3-a456-426614174021" }
          : table === "profiles"
            ? { team_id: creatorTeamId }
            : null;
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          async maybeSingle() { return { data, error: null }; },
        };
        return builder;
      },
      async rpc() {
        rpcCount += 1;
        return { data: { id: subTopicId, library_status: "removed" }, error: null };
      },
    };
    return { client, rpcCount: () => rpcCount };
  };
  const actor = { actorId: "admin-1", teamId: "team-a", canReviewContent: true };

  const sameTeam = makeClient("team-a");
  assert.deepEqual(await removeSubTopic(sameTeam.client as never, actor, subTopicId), {
    ok: true,
    value: { removed: true },
  });
  assert.equal(sameTeam.rpcCount(), 1);

  const otherTeam = makeClient("team-b");
  const rejected = await removeSubTopic(otherTeam.client as never, actor, subTopicId);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.status, 403);
  assert.equal(otherTeam.rpcCount(), 0);
});

test("选题池聚合 RPC：读最新字段 latestPublishedAt，缺字段时为 null", async () => {
  const scope = { kind: "team", teamId: "team-1" } as never;
  const call = (payload: Record<string, unknown>) => loadTopicPoolWorkAggregates({
    rpc: async () => ({ data: { "sub-1": payload }, error: null }),
  } as never, scope);

  const present = await call({ workCount: 1, latestPublishedAt: "2026-10-05T00:00:00.000Z" });
  assert.equal(present.get("sub-1")?.latestPublishedAt, "2026-10-05T00:00:00.000Z");

  const absent = await call({ workCount: 1 });
  assert.equal(absent.get("sub-1")?.latestPublishedAt, null);
});
