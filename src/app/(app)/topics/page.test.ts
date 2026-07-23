import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTopicPoolResponse,
  resolvePageAfterLoad,
  type RecommendationResponse,
  type ComparisonRow
} from "./topic-helpers";

test("选题池接口失败时抛错，避免显示成暂无选题", async () => {
  await assert.rejects(
    () =>
      fetchTopicPoolResponse("/api/topics/pool", async () =>
        new Response(JSON.stringify({ error: "选题服务不可用" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /选题服务不可用/,
  );
});

test("加载更多失败时保留当前页，成功后才前进", () => {
  assert.equal(resolvePageAfterLoad(2, false), 2);
  assert.equal(resolvePageAfterLoad(2, true), 3);
});

test("系统推荐接口正确解析 suggestions 数组与全局依据", async () => {
  const mockPayload = {
    evidenceSummary: "全网护肤热度上升",
    sampleCount: 15,
    marketDate: "2026-07-23",
    suggestions: [
      {
        title: "夏季防晒技巧",
        category: "美妆护肤",
        angle: "痛点切入",
        expectedPerformance: "超 2w 播放",
        evidence: "同类互动率高"
      }
    ]
  };

  const res = (await fetchTopicPoolResponse("/api/topics/recommendations", async () =>
    new Response(JSON.stringify(mockPayload), { status: 200 })
  )) as RecommendationResponse;

  assert.equal(res.evidenceSummary, "全网护肤热度上升");
  assert.equal(res.sampleCount, 15);
  assert.equal(res.suggestions?.[0].title, "夏季防晒技巧");
});

test("横向对比接口正确解析 rows 与低样本标识", async () => {
  const mockPayload = {
    rows: [
      {
        topicId: "t1",
        topicName: "美妆",
        workCount: 2,
        qualifiedRate: 0.5,
        avgPlayCount: 15000,
        bestPlayCount: 30000,
        lowConfidence: true
      }
    ]
  };

  const res = (await fetchTopicPoolResponse("/api/topics/comparison?days=14", async () =>
    new Response(JSON.stringify(mockPayload), { status: 200 })
  )) as { rows: ComparisonRow[] };

  assert.equal(res.rows[0].topicName, "美妆");
  assert.equal(res.rows[0].lowConfidence, true);
  assert.equal(res.rows[0].workCount, 2);
});
