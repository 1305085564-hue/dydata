import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { loadSubTopicWorks } from "./works";

function queryFor(result: { data: unknown[]; error: null }) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    range: () => query,
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

test("话题作品详情按团队达标基准返回质量值", async () => {
  const supabase = {
    from: (table: string) => queryFor({
      data: table === "videos"
        ? [{
            id: "video-1",
            topic_id: "topic-1",
            user_id: "member-1",
            video_title: "作品",
            content: "正文",
            published_at: "2026-10-01T00:00:00Z",
            uploaded_at: "2026-10-01T00:00:00Z",
            profiles: { name: "成员" },
            video_metrics_snapshots: [{
              snapshot_type: "24h",
              captured_at: "2026-10-02T00:00:00Z",
              play_count: 15000,
              likes: 450,
              comments: 0,
              shares: 0,
              favorites: 600,
              follower_gain: 0,
              follower_convert: 0,
            }],
          }]
        : [{ video_id: "video-1", tag_value: "干货" }],
      error: null,
    }),
  } as never;
  const standards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    targets: {
      reviewLikeRate: 10,
      dryFavoriteRate: 10,
      interactionRate: 20,
      followerRate: 2,
    },
  };

  const result = await loadSubTopicWorks(
    supabase,
    "sub-topic-1",
    { teamId: "trusted-team", visibleUserIds: ["member-1"] } as never,
    { sort: "best", page: 1, pageSize: 20 },
    { topic_id: "topic-1", group_id: null, library_status: "active" },
    { includeSimilar: false, evaluationStandards: standards },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as { items: Array<{ contentQuality: { interactionAchievement: number | null; coreAchievement: number | null } }> };
  const item = value.items[0];
  assert.equal(item?.contentQuality.interactionAchievement, 35);
  assert.equal(item?.contentQuality.coreAchievement, 40);
});
