import assert from "node:assert/strict";
import test from "node:test";
import { memoryDatabase } from "../testing/maintenance.test.fixture";
import { calculateTopicWorkSummary, matchesPostFilters } from "./domain";
import { loadScoredTopicPool } from "./data/pool-scored";

for (const [playCount, qualified, average] of [[29999, 0, null], [30000, 1, 30000]] as const) {
  test(`选题达标边界 ${playCount}：汇总和成绩过滤一致`, () => {
    const summary = calculateTopicWorkSummary([{ playCount, content: "真实作品文案", uploadedAt: "2026-11-28T00:00:00Z", publishedAt: "2026-11-27T00:00:00Z" }]);
    assert.equal(summary.qualifiedWorkCount, qualified);
    assert.equal(summary.averagePlayCount, average);
    assert.equal(matchesPostFilters({ summary }, { performance: "high_avg_play" }), qualified === 1);
  });
}

test("选题池回退到作品数据计算时，29999 不达标、30000 达标，过滤只保留达标项", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-11-28T00:00:00Z"));
  const db = memoryDatabase({
    sub_topics: ["below", "at"].map((id) => ({ id, title: id, created_by: "u1", library_status: "in_library", sub_topic_claims: [] })),
    videos: [
      { id: "v1", topic_id: "below", user_id: "u1", lifecycle_state: "active", published_at: "2026-11-27T00:00:00Z", video_metrics_snapshots: [{ play_count: 29999 }] },
      { id: "v2", topic_id: "at", user_id: "u1", lifecycle_state: "active", published_at: "2026-11-27T00:00:00Z", video_metrics_snapshots: [{ play_count: 30000 }] },
    ], sub_topic_claims: [],
  });
  const from = db.from;
  const client = {
    // 模拟旧库未部署聚合接口，强制执行真实的内存汇总回退路径。
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "aggregate unavailable" } }),
    from(table: string) {
      const query = from(table);
      // 此用例的两条作品均在近七天；热度查询的时间条件对这批边界数据无筛除。
      return Object.assign(query, { or: () => query });
    },
  };
  const scope = { userId: "u1", role: "member", permissions: {}, teamId: "team", kind: "self", visibleUserIds: ["u1"], activeVisibleUserIds: ["u1"] };
  const result = await loadScoredTopicPool(client as never, "u1", scope as never, {
    view: "trending", timeRange: "all", topicIds: [], page: 1, pageSize: 20, performance: "high_qualified",
  }, "trending");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as { items: Array<{ id: string; summary: { qualifiedWorkCount: number }; _avgPlayCount: number }> };
  assert.deepEqual(value.items.map((item) => item.id), ["at"]);
  assert.equal(value.items[0]._avgPlayCount, 30000);
});
