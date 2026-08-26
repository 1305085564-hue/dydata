import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTopicJson,
  getTopicActionState,
  parseClaimsResponse,
  parseComparisonResponse,
  parseCreatedSubTopicResponse,
  parseActiveTopicsResponse,
  parseTopicOptionsResponse,
  parseTopicPoolResponse,
  parseSubTopicDetailResponse,
  parseSuggestedSubTopicsResponse,
  parseTopicWorksResponse,
} from "./v2-client-contract";

test("fetchTopicJson 在非 2xx 响应时抛出后端错误", async () => {
  await assert.rejects(
    () => fetchTopicJson("/api/topics/pool", undefined, async () => new Response(JSON.stringify({ error: "服务暂不可用" }), { status: 503 })),
    /服务暂不可用/,
  );
});

test("V2 契约解析创建、查重和横向对比的真实业务 JSON", () => {
  const created = parseCreatedSubTopicResponse({ id: "sub-1", title: "新选题", hook: null });
  assert.equal(created.id, "sub-1");
  assert.equal(created.hook, null);

  const suggestions = parseSuggestedSubTopicsResponse([
    { id: "sub-1", title: "相似题", hook: null, topicName: null, groupName: null },
  ]);
  assert.equal(suggestions[0]?.title, "相似题");
  assert.equal(suggestions[0]?.hook, null);

  const comparison = parseComparisonResponse({
    dimension: "topic",
    windowDays: 30,
    rows: [{ topicId: "topic-1", topicName: "母题", qualifiedCount: 1, qualifiedRate: 0.5, avgPlayCount: 1200, bestPlayCount: 3000 }],
    sampleTotal: 2,
  });
  assert.equal(comparison.rows[0]?.qualifiedRate, 0.5);
  assert.equal(comparison.rows[0]?.qualifiedCount, 1);
  assert.equal(comparison.rows[0]?.avgPlayCount, 1200);
  assert.equal(comparison.rows[0]?.bestPlayCount, 3000);
});

test("V2 契约解析完整母题 options", () => {
  assert.deepEqual(parseTopicOptionsResponse({
    topics: [
      { id: "topic-1", name: "母题一", sort_order: 10 },
      { id: "topic-2", name: "母题二", sort_order: 20 },
    ],
  }), [
    { id: "topic-1", name: "母题一" },
    { id: "topic-2", name: "母题二" },
  ]);
});

test("V2 契约解析选题池统计、当前认领和真实分页", () => {
  const pool = parseTopicPoolResponse({
    items: [{
      id: "sub-1",
      title: "选题一",
      hook: null,
      topic_id: "topic-1",
      myClaim: { id: "claim-1", sub_topic_id: "sub-1", status: "scripting", claimed_at: null },
      claimCount: 3,
      candidateCount: 2,
      scriptingCount: 1,
      summary: { qualifiedWorkCount: 2, averagePlayCount: 3200, bestPlayCount: 7000 },
    }],
    pagination: { page: 2, pageSize: 20, totalItems: 41 },
  });

  assert.equal(pool.items[0]?.hook, null);
  assert.equal(pool.items[0]?.myClaim?.status, "scripting");
  assert.equal(pool.items[0]?.scriptingCount, 1);
  assert.deepEqual(pool.pagination, { page: 2, pageSize: 20, totalItems: 41 });
});

test("V2 契约解析团队动态，空 Hook 不报错", () => {
  const active = parseActiveTopicsResponse({
    recentlyClaimed: [{
      id: "claim-1",
      sub_topic_id: "sub-1",
      user_id: "user-1",
      status: "candidate",
      claimed_at: null,
      profiles: { name: "小王" },
      sub_topics: { id: "sub-1", title: "聚焦选题", hook: null },
    }],
    recentlyWorked: [{
      id: "video-1",
      video_title: "成片一",
      uploaded_at: "2026-08-02T00:00:00.000Z",
      sub_topics: { id: "sub-1", title: "聚焦选题", hook: null },
    }],
  });

  assert.equal(active.recentlyClaimed[0]?.displayName, "小王");
  assert.equal(active.recentlyClaimed[0]?.subTopic?.hook, null);
  assert.equal(active.recentlyWorked[0]?.subTopic?.title, "聚焦选题");
});

test("V2 契约解析详情、作品播放量和撞车字段", () => {
  const detail = parseSubTopicDetailResponse({
    subTopic: {
      id: "sub-1",
      title: "详情标题",
      hook: null,
      myClaim: { id: "claim-1", subTopicId: "sub-1", status: "candidate", claimedAt: null },
    },
    works: {
      items: [{ id: "video-1", video_title: "作品", video_metrics_snapshots: [{ play_count: 4567 }] }],
      pagination: { page: 1, pageSize: 20, totalItems: 1 },
      summary: null,
      similarReferences: [],
    },
  });
  assert.equal(detail.subTopic?.hook, null);
  assert.equal(detail.subTopic?.myClaim?.status, "candidate");
  assert.equal(detail.works.items[0]?.playCount, 4567);

  const claims = parseClaimsResponse({
    claims: [{ id: "claim-1", userId: "user-1", displayName: "小王", status: "scripting", claimedAt: null }],
    candidateCount: 0,
    scriptingCount: 1,
  });
  assert.deepEqual(claims.claims[0], {
    id: "claim-1",
    userId: "user-1",
    displayName: "小王",
    status: "scripting",
    claimedAt: null,
  });
});

test("详情动作严格遵守未认领、候选和脚本中三态", () => {
  assert.deepEqual(getTopicActionState(null), {
    canClaim: true,
    canStartScripting: false,
    canReturn: false,
    label: "认领到候选",
  });
  assert.deepEqual(getTopicActionState({ id: "c", subTopicId: "s", status: "candidate", claimedAt: null }), {
    canClaim: false,
    canStartScripting: true,
    canReturn: true,
    label: "开始写脚本",
  });
  assert.deepEqual(getTopicActionState({ id: "c", subTopicId: "s", status: "scripting", claimedAt: null }), {
    canClaim: false,
    canStartScripting: false,
    canReturn: true,
    label: "脚本中",
  });
});
