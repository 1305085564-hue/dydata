import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_PLAY_BUCKET_KEY,
  DEFAULT_CONTENT_LIST_FILTERS,
  PLAY_BUCKETS,
  filterContentVideos,
  parseContentListFilters,
  writeContentListFilters,
} from "./content-list-filters";

const videos = [
  {
    id: "video-1",
    user_id: "user-1",
    account_id: "account-1",
    video_title: "黄金复盘",
    content: "今天讲趋势",
    published_at: "2026-09-18T10:00:00+08:00",
  },
  {
    id: "video-2",
    user_id: "user-2",
    account_id: "account-2",
    video_title: "美股观察",
    content: "黄金回调",
    published_at: "2026-09-20T09:00:00+08:00",
  },
];

test("视频复盘列表筛选支持人员、账号、日期与标题/内容关键词叠加", () => {
  assert.deepEqual(
    filterContentVideos(videos, {
      ...DEFAULT_CONTENT_LIST_FILTERS,
      userId: "user-2",
      accountId: "account-2",
      startDate: "2026-09-19",
      endDate: "2026-09-20",
      keyword: "黄金",
    }).map((video) => video.id),
    ["video-2"],
  );
});

test("人员筛选优先按账号负责人，兼容没有账号负责人的旧视频", () => {
  const scopedVideos = [
    { ...videos[0], accounts: { profile_id: "owner-1" } },
    { ...videos[1], accounts: null },
  ];
  assert.deepEqual(
    filterContentVideos(scopedVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, userId: "owner-1" }).map((video) => video.id),
    ["video-1"],
  );
  assert.deepEqual(
    filterContentVideos(scopedVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, userId: "user-2" }).map((video) => video.id),
    ["video-2"],
  );
});

test("视频复盘列表筛选排除无发布日期的视频，并支持大小写不敏感关键词", () => {
  assert.deepEqual(
    filterContentVideos(
      [
        ...videos,
        {
          id: "video-3",
          user_id: "user-1",
          account_id: "account-1",
          video_title: "AI NEWS",
          content: null,
          published_at: null,
        },
      ],
      { ...DEFAULT_CONTENT_LIST_FILTERS, startDate: "2026-09-01" },
    ).map((video) => video.id),
    ["video-1", "video-2"],
  );

  assert.deepEqual(
    filterContentVideos(videos, {
      ...DEFAULT_CONTENT_LIST_FILTERS,
      keyword: "GOLD",
    }).map((video) => video.id),
    [],
  );
});

test("筛选 URL 可往返并删除空值", () => {
  const source = new URLSearchParams(
    "view=all&userId=user-1&accountId=account-1&startDate=2026-09-01&endDate=2026-09-20&keyword=%E9%BB%84%E9%87%91",
  );
  assert.deepEqual(parseContentListFilters(source), {
    userId: "user-1",
    accountId: "account-1",
    startDate: "2026-09-01",
    endDate: "2026-09-20",
    keyword: "黄金",
    playBucket: "",
    playMin: "",
    playMax: "",
  });

  const reset = writeContentListFilters(source, DEFAULT_CONTENT_LIST_FILTERS);
  assert.equal(reset.toString(), "view=all");
});

// ===== 流量筛选（24h 播放量五档 + 自定义）=====

test("流量档位按 2000/5000/20000/50000 切档，min 含 max 不含", () => {
  assert.deepEqual(
    PLAY_BUCKETS.map((bucket) => bucket.key),
    ["lt2k", "2k-5k", "5k-2w", "2w-5w", "ge5w"],
  );
  const playCountById = new Map<string, number | null>([
    ["video-1", 1_999],
    ["video-2", 2_000],
  ]);
  assert.deepEqual(
    filterContentVideos(videos, { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: "lt2k" }, playCountById).map((v) => v.id),
    ["video-1"],
  );
  assert.deepEqual(
    filterContentVideos(videos, { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: "2k-5k" }, playCountById).map((v) => v.id),
    ["video-2"],
  );
});

test("流量档位「≥5万」无上界，边界值 50000 命中", () => {
  const playCountById = new Map<string, number | null>([
    ["video-1", 49_999],
    ["video-2", 50_000],
  ]);
  assert.deepEqual(
    filterContentVideos(videos, { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: "ge5w" }, playCountById).map((v) => v.id),
    ["video-2"],
  );
});

test("启用流量筛选时排除没有 24h 快照的视频，避免把「未知」混入低档", () => {
  const playCountById = new Map<string, number | null>([
    ["video-1", 800],
    ["video-2", null],
  ]);
  assert.deepEqual(
    filterContentVideos(videos, { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: "lt2k" }, playCountById).map((v) => v.id),
    ["video-1"],
  );
  // 未提供 playCountById 时，任何视频都视为未知 → 全部排除
  assert.deepEqual(
    filterContentVideos(videos, { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: "lt2k" }).map((v) => v.id),
    [],
  );
});

test("自定义流量区间支持单边：只填最小=≥min，只填最大=<max", () => {
  const playCountById = new Map<string, number | null>([
    ["video-1", 3_000],
    ["video-2", 12_000],
  ]);
  assert.deepEqual(
    filterContentVideos(
      videos,
      { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: CUSTOM_PLAY_BUCKET_KEY, playMin: "5000" },
      playCountById,
    ).map((v) => v.id),
    ["video-2"],
  );
  assert.deepEqual(
    filterContentVideos(
      videos,
      { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: CUSTOM_PLAY_BUCKET_KEY, playMax: "5000" },
      playCountById,
    ).map((v) => v.id),
    ["video-1"],
  );
});

test("自定义区间两边都填 = 左闭右开；都没填视为不筛", () => {
  const playCountById = new Map<string, number | null>([
    ["video-1", 4_999],
    ["video-2", 5_000],
  ]);
  assert.deepEqual(
    filterContentVideos(
      videos,
      { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: CUSTOM_PLAY_BUCKET_KEY, playMin: "3000", playMax: "5000" },
      playCountById,
    ).map((v) => v.id),
    ["video-1"],
  );
  assert.deepEqual(
    filterContentVideos(
      videos,
      { ...DEFAULT_CONTENT_LIST_FILTERS, playBucket: CUSTOM_PLAY_BUCKET_KEY },
      playCountById,
    ).map((v) => v.id),
    ["video-1", "video-2"],
  );
});

test("流量筛选 URL 可往返并跟随重置清空", () => {
  const source = new URLSearchParams("view=all&playBucket=2w-5w");
  assert.deepEqual(parseContentListFilters(source), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    playBucket: "2w-5w",
  });
  const customSource = new URLSearchParams("playBucket=custom&playMin=1000&playMax=8000");
  assert.deepEqual(parseContentListFilters(customSource), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    playBucket: "custom",
    playMin: "1000",
    playMax: "8000",
  });
  const reset = writeContentListFilters(customSource, DEFAULT_CONTENT_LIST_FILTERS);
  assert.equal(reset.toString(), "");
});
