import test from "node:test";
import assert from "node:assert/strict";
import type { DataAccessScope } from "../data-access-scope";

import {
  buildPoolQueryOptions,
  calculateTopicWorkSummary,
  loadTopicPool,
  matchTopicGroup,
  rankSuggestedSubTopics,
  validateCandidateClaimLimit,
} from "./service";

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

test("候选上限最多允许 5 条，已有同一候选时保持幂等", () => {
  assert.deepEqual(validateCandidateClaimLimit({ currentCandidateCount: 4, alreadyCandidate: false }), {
    ok: true,
  });
  assert.deepEqual(validateCandidateClaimLimit({ currentCandidateCount: 5, alreadyCandidate: true }), {
    ok: true,
  });
  assert.deepEqual(validateCandidateClaimLimit({ currentCandidateCount: 5, alreadyCandidate: false }), {
    ok: false,
    status: 409,
    message: "候选选题最多保留 5 条，请先放回一个选题",
  });
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
      topicId: "123e4567-e89b-12d3-a456-426614174001",
      page: 1,
      pageSize: 50,
    },
  });

  assert.deepEqual(buildPoolQueryOptions(new URLSearchParams("view=bad")), {
    ok: false,
    status: 400,
    message: "view 只能是 all、my_claims 或 my_created",
  });

  assert.deepEqual(buildPoolQueryOptions(new URLSearchParams("topic_id=not-a-uuid")), {
    ok: false,
    status: 400,
    message: "topic_id 格式不正确",
  });
});

test("我的认领视图按有效认领 id 在数据库层过滤，不按子题创建时间过滤", async () => {
  const fake = createFakeSupabase({
    sub_topics: [
      {
        data: [
          {
            id: "sub-old",
            title: "很早创建但仍在认领的选题",
            sub_topic_claims: [{ id: "claim-1", user_id: "user-1", status: "candidate", claimed_at: "2026-01-01T00:00:00.000Z" }],
          },
        ],
        count: 1,
      },
    ],
    sub_topic_claims: [{ data: [{ sub_topic_id: "sub-old" }] }],
    videos: [{ data: [] }],
  });

  const result = await loadTopicPool(
    fake.client as never,
    "user-1",
    {
      userId: "user-1",
      role: "owner",
      businessRole: "owner",
      permissions: {},
      accessLevel: 4,
      teamId: null,
      groupId: null,
      kind: "all",
      visibleUserIds: ["user-1"],
    } as DataAccessScope,
    { view: "my_claims", timeRange: "3d", page: 1, pageSize: 50, topicId: null },
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
        sub_topic_claims: [{ id: "claim-1", user_id: "user-1", status: "candidate", claimed_at: "2026-01-01T00:00:00.000Z" }],
        summary: { qualifiedWorkCount: 0, averagePlayCount: null, bestCopy: null, latestCopy: null },
        claimCount: 1,
      },
    ],
    pagination: { page: 1, pageSize: 50, totalItems: 1 },
  });
});

test("子题汇总只统计播放量不低于 1000 的作品", () => {
  const summary = calculateTopicWorkSummary([
    { playCount: 999, content: "低流量", uploadedAt: "2026-07-01T00:00:00.000Z" },
    { playCount: 1000, content: "达标文案", uploadedAt: "2026-07-02T00:00:00.000Z" },
    { playCount: 3000, content: "更好文案", uploadedAt: "2026-07-03T00:00:00.000Z" },
  ]);

  assert.equal(summary.qualifiedWorkCount, 2);
  assert.equal(summary.averagePlayCount, 2000);
  assert.equal(summary.bestCopy, "更好文案");
  assert.equal(summary.latestCopy, "更好文案");
});
