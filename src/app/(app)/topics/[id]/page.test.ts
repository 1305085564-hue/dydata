import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSubTopicDetailResponse,
  parseSubTopicWorksResponse,
  resolveWorkLikes,
  calculateTotalInFlight,
  getRecommendationKey
} from "../topic-helpers";

test("parseSubTopicDetailResponse 能正确从 { subTopic, works } 抽取子题实体与关联作品", () => {
  const mockPayload = {
    ok: true,
    value: {
      subTopic: {
        id: "sub-100",
        title: "美妆技巧爆款解构",
        hook: "一秒抓住观众",
        created_by: "user-123"
      },
      works: {
        items: [
          {
            id: "work-1",
            video_title: "防晒测验",
            video_metrics_snapshots: [{ play_count: 50000, likes: 3200 }]
          }
        ],
        total: 15
      }
    }
  };

  const { subTopic, worksItems, worksTotal } = parseSubTopicDetailResponse(mockPayload);

  assert.ok(subTopic);
  assert.equal(subTopic.title, "美妆技巧爆款解构");
  assert.equal(subTopic.created_by, "user-123");
  assert.equal(worksItems.length, 1);
  assert.equal(worksTotal, 15);
  assert.equal(worksItems[0].video_title, "防晒测验");
});

test("parseSubTopicWorksResponse 解析后端 pagination、items 和 similarReferences", () => {
  const mockWorksPayload = {
    ok: true,
    value: {
      items: [{ id: "w-1", video_title: "作品一" }],
      similarReferences: [{ id: "ref-1", video_title: "同类参考作品" }],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 42
      }
    }
  };

  const parsed = parseSubTopicWorksResponse(mockWorksPayload);

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.similarReferences.length, 1);
  assert.equal(parsed.total, 42);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 10);
});

test("parseSubTopicWorksResponse 默认应用 DETAIL_PAGE_SIZE=20 分页契约", () => {
  const parsed = parseSubTopicWorksResponse({ ok: true, value: { items: [], total: 0 } });
  assert.equal(parsed.pageSize, 20);
});

test("resolveWorkLikes 兼容 likes 与 like_count 双重备选字段", () => {
  assert.equal(resolveWorkLikes({ likes: 500 }), 500);
  assert.equal(resolveWorkLikes({ like_count: 350 }), 350);
  assert.equal(resolveWorkLikes({ likes: 100, like_count: 350 }), 100);
  assert.equal(resolveWorkLikes(null), 0);
  assert.equal(resolveWorkLikes({}), 0);
});

test("calculateTotalInFlight 包含 candidateCount 与 scriptingCount 总计", () => {
  const total = calculateTotalInFlight({ candidateCount: 4, scriptingCount: 2 });
  assert.equal(total, 6);
});

test("getRecommendationKey 能稳定计算推荐项 Key，受 angle 区分但不受 index 影响", () => {
  const key1 = getRecommendationKey({ title: "打造账号 IP", category: "定位指南", angle: "新号起步" });
  const key2 = getRecommendationKey({ title: "打造账号 IP", category: "定位指南", angle: "新号起步" });
  const key3 = getRecommendationKey({ title: "打造账号 IP", category: "定位指南", angle: "老号转型" });
  
  assert.equal(key1, "打造账号 IP-定位指南-新号起步");
  assert.equal(key1, key2); // 相同角度的 Key 必须相同，实现连续忽略与稳定映射
  assert.notEqual(key1, key3); // 同标题但不同角度的推荐必须被区分
});
