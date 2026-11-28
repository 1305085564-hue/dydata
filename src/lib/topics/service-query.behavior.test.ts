import test from "node:test";
import assert from "node:assert/strict";
import type { DataAccessScope } from "../data-access-scope";
import { buildMyClaim, buildPoolQueryOptions, rankSuggestedSubTopics, sortTopicPoolItems, validateSubTopicInput } from "./domain";
import { loadActiveTopics, loadTopicLibraryBootstrap, loadTopicOptions } from "./data";
import { matchTopicGroup } from "./group-matching";

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
