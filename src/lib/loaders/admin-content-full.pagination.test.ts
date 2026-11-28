import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminContentPageData } from "./admin-content-full";

function createRangeTableQuery<T>(rows: T[]) {
  let rangeStart = 0;
  let rangeEnd = 999;
  let limitValue: number | null = null;
  let inFilter: { col: string; values: unknown[] } | null = null;

  const chain = {
    select() { return chain; },
    eq() { return chain; },
    lt() { return chain; },
    in(col: string, values: unknown[]) {
      inFilter = { col, values };
      return chain;
    },
    order() { return chain; },
    limit(value: number) {
      limitValue = value;
      return chain;
    },
    range(from: number, to: number) {
      rangeStart = from;
      rangeEnd = to;
      return chain;
    },
    abortSignal() { return chain; },
    then(resolve: (value: { data: T[]; error: null }) => unknown) {
      let filtered = rows;
      if (inFilter) {
        const allowed = new Set(inFilter.values);
        filtered = rows.filter((row) => allowed.has((row as Record<string, unknown>)[inFilter!.col]));
      }
      const sliced = limitValue !== null
        ? filtered.slice(0, limitValue)
        : filtered.slice(rangeStart, rangeEnd + 1);
      return Promise.resolve({ data: sliced, error: null }).then(resolve);
    },
  };
  return chain;
}

test("内容全量加载在成员、24h 快照、拆段、话题标签及上一条快照突破 1000 行时均稳定翻页不静默截断", async () => {
  const targetUserId = "user-1049";
  const currentVideoId = "video-current";
  const previousVideoId = "video-previous";

  const profiles = Array.from({ length: 1050 }, (_, index) => ({
    id: `user-${String(index).padStart(4, "0")}`,
    name: `成员${String(index).padStart(4, "0")}`,
  }));

  const videos = [
    {
      id: currentVideoId,
      account_id: "account-1",
      user_id: targetUserId,
      video_url: "https://example.com/current",
      video_title: "当前作品",
      content: "完整文案",
      published_at: "2026-11-28T08:00:00.000Z",
      uploaded_at: "2026-11-28T08:00:00.000Z",
      anomaly_status: null,
      created_at: "2026-11-28T08:00:00.000Z",
      accounts: { name: "账号A", profile_id: targetUserId },
      profiles: { name: "成员1049" },
    },
    {
      id: previousVideoId,
      account_id: "account-1",
      user_id: targetUserId,
      video_url: "https://example.com/previous",
      video_title: "上一条作品",
      content: "上一条文案",
      published_at: "2026-11-27T08:00:00.000Z",
      uploaded_at: "2026-11-27T08:00:00.000Z",
      anomaly_status: null,
      created_at: "2026-11-27T08:00:00.000Z",
      accounts: { name: "账号A", profile_id: targetUserId },
      profiles: { name: "成员1049" },
    },
  ];

  // 前 1005 条为同一批视频的较旧历史快照，第 1006/1007 条落在第二页
  const snapshots = [
    ...Array.from({ length: 1005 }, (_, index) => ({
      id: `snap-old-${index}`,
      video_id: previousVideoId,
      snapshot_type: "24h",
      captured_at: "2026-11-27T09:00:00.000Z",
      play_count: 4_000,
      likes: 10,
      comments: 1,
      shares: 1,
      favorites: 1,
      avg_play_duration: 10,
      avg_play_ratio: 0.5,
      bounce_rate_2s: 0.2,
      completion_rate_5s: 0.6,
      completion_rate: 0.3,
    })),
    {
      id: "snap-current-latest",
      video_id: currentVideoId,
      snapshot_type: "24h",
      captured_at: "2026-11-28T12:00:00.000Z",
      play_count: 15_000,
      likes: 100,
      comments: 10,
      shares: 5,
      favorites: 20,
      avg_play_duration: 18,
      avg_play_ratio: 0.7,
      bounce_rate_2s: 0.15,
      completion_rate_5s: 0.75,
      completion_rate: 0.45,
    },
    {
      id: "snap-previous-latest",
      video_id: previousVideoId,
      snapshot_type: "24h",
      captured_at: "2026-11-27T12:00:00.000Z",
      play_count: 5_000,
      likes: 20,
      comments: 2,
      shares: 1,
      favorites: 3,
      avg_play_duration: 12,
      avg_play_ratio: 0.5,
      bounce_rate_2s: 0.2,
      completion_rate_5s: 0.6,
      completion_rate: 0.3,
    },
  ];

  // 1005 条拆段属于 previousVideoId，currentVideoId 的拆段落到第二页
  const segments = [
    ...Array.from({ length: 1005 }, (_, index) => ({ id: `seg-${index}`, video_id: previousVideoId })),
    { id: "seg-current", video_id: currentVideoId },
  ];

  // 1005 条话题标签属于 previousVideoId，currentVideoId 的话题标签落到第二页
  const topicTags = [
    ...Array.from({ length: 1005 }, (_, index) => ({ id: `tag-${index}`, video_id: previousVideoId, tag_value: "日常" })),
    { id: "tag-current", video_id: currentVideoId, tag_value: "干货方法" },
  ];

  let videoCalls = 0;
  const supabase = {
    from(table: string) {
      if (table === "videos") {
        videoCalls += 1;
        // 第一次是全量视频分页，第二次是结算排除字段，第三次是上一条边界视频
        if (videoCalls === 1) return createRangeTableQuery(videos);
        if (videoCalls === 2) {
          return createRangeTableQuery(videos.map((v) => ({ id: v.id, settlement_excluded: false, settlement_excluded_reason: null })));
        }
        return createRangeTableQuery([]);
      }
      if (table === "profiles") return createRangeTableQuery(profiles);
      if (table === "video_metrics_snapshots") return createRangeTableQuery(snapshots);
      if (table === "video_content_segments") return createRangeTableQuery(segments);
      if (table === "video_tags") return createRangeTableQuery(topicTags);
      throw new Error(`unexpected table: ${table}`);
    },
  } as never;

  const data = await loadAdminContentPageData({
    supabase,
    scope: {
      kind: "company",
      userId: targetUserId,
      teamId: null,
      visibleUserIds: profiles.map((profile) => profile.id),
      activeVisibleUserIds: profiles.map((profile) => profile.id),
    } as never,
  });

  // 1) 超过 1000 人的成员清单完整读全
  assert.equal(data.profiles.length, 1050);
  assert.equal(data.ownerNames?.[targetUserId], "成员1049");

  // 2) 第二页的 24h 快照与拆段完整命中，没有被 1000 行静默截断
  const currentSnapshot = data.snapshots.find((row) => row.video_id === currentVideoId);
  assert.equal(currentSnapshot?.play_count, 15_000);
  assert.equal(data.reviewReadiness[currentVideoId]?.has_snapshot_24h, true);
  assert.equal(data.reviewReadiness[currentVideoId]?.has_segments, true);

  // 3) 第二页的话题标签完整命中（干货类）
  assert.ok(data.contentQualityByVideoId[currentVideoId]);

  // 4) loadPlayChangeSignals 的上一条快照翻页读全（5000 -> 15000 = +200% 且增量 > 5000 -> surge）
  const currentVideo = data.videos.find((row) => row.id === currentVideoId);
  assert.equal(currentVideo?.previous_play_count, 5_000);
  assert.equal(currentVideo?.play_change_signal, "surge");
});
