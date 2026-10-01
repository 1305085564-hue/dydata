import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_PLAY_BUCKET_KEY,
  DEFAULT_CONTENT_LIST_FILTERS,
  PLAY_BUCKETS,
  filterContentVideos,
  getSecondaryFilterSummary,
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
    qualityGrade: "all",
    onlyAnomaly: false,
    timeRange: "custom",
    topicStatus: "all",
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

// ===== 综合评级筛选（优 / 良 / 普 / 劣 / 未评级）=====

test("综合评级筛选支持 URL 解析与往返，默认或非法值回退为 all", () => {
  const source = new URLSearchParams("qualityGrade=excellent");
  assert.deepEqual(parseContentListFilters(source), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    qualityGrade: "excellent",
  });

  const unratedSource = new URLSearchParams("qualityGrade=unrated");
  assert.equal(parseContentListFilters(unratedSource).qualityGrade, "unrated");

  const invalidSource = new URLSearchParams("qualityGrade=not_exist");
  assert.equal(parseContentListFilters(invalidSource).qualityGrade, "all");

  const written = writeContentListFilters(new URLSearchParams(), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    qualityGrade: "good",
  });
  assert.equal(written.toString(), "qualityGrade=good");

  const reset = writeContentListFilters(written, DEFAULT_CONTENT_LIST_FILTERS);
  assert.equal(reset.toString(), "");
});

test("综合评级筛选按各档位过滤作品，未关联视频不参与评级筛选命中", () => {
  const qualityByVideoId = new Map([
    ["video-1", {
      topicKind: "dry_goods" as const,
      coreMetric: "favoriteRate" as const,
      snapshotPlayCount: 10000,
      interactionAchievement: 120,
      coreAchievement: 110,
      contentAchievement: 115,
      contentGrade: "优" as const,
      overallGrade: "优" as const,
      status: "rated" as const,
    }],
    ["video-2", {
      topicKind: "review" as const,
      coreMetric: "likeRate" as const,
      snapshotPlayCount: 2000,
      interactionAchievement: null,
      coreAchievement: null,
      contentAchievement: null,
      contentGrade: null,
      overallGrade: "劣" as const, // 播放低于 5000 判劣
      status: "invalid_play" as const,
    }],
    ["video-3", {
      topicKind: "review" as const,
      coreMetric: "likeRate" as const,
      snapshotPlayCount: 8000,
      interactionAchievement: null,
      coreAchievement: null,
      contentAchievement: null,
      contentGrade: null,
      overallGrade: null,
      status: "missing_metrics" as const,
    }],
    ["video-4", {
      topicKind: null,
      coreMetric: null,
      snapshotPlayCount: null,
      interactionAchievement: null,
      coreAchievement: null,
      contentAchievement: null,
      contentGrade: null,
      overallGrade: null,
      status: "unlinked" as const,
    }],
  ]);

  const testVideos = [
    { id: "video-1", user_id: "u-1", account_id: "a-1", video_title: "1", content: null, published_at: "2026-09-01" },
    { id: "video-2", user_id: "u-1", account_id: "a-1", video_title: "2", content: null, published_at: "2026-09-02" },
    { id: "video-3", user_id: "u-1", account_id: "a-1", video_title: "3", content: null, published_at: "2026-09-03" },
    { id: "video-4", user_id: "u-1", account_id: "a-1", video_title: "4", content: null, published_at: "2026-09-04" },
  ];

  // 1. 筛选「优」：仅 video-1
  assert.deepEqual(
    filterContentVideos(testVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, qualityGrade: "excellent" }, undefined, qualityByVideoId).map((v) => v.id),
    ["video-1"],
  );

  // 2. 筛选「劣」：video-2（低播放判劣）
  assert.deepEqual(
    filterContentVideos(testVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, qualityGrade: "poor" }, undefined, qualityByVideoId).map((v) => v.id),
    ["video-2"],
  );

  // 3. 筛选「未评级」：video-3（missing_metrics 综合为空）；video-4（unlinked）按规范不参与筛选命中
  assert.deepEqual(
    filterContentVideos(testVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, qualityGrade: "unrated" }, undefined, qualityByVideoId).map((v) => v.id),
    ["video-3"],
  );

  // 4. 筛选「全部」：保留全部视频
  assert.deepEqual(
    filterContentVideos(testVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, qualityGrade: "all" }, undefined, qualityByVideoId).map((v) => v.id),
    ["video-1", "video-2", "video-3", "video-4"],
  );
});

// ===== 待处理异常快速筛选 =====

test("待处理异常开关仅保留异常/限流/删稿/腰斩视频", () => {
  const anomalyVideos = [
    { id: "v-normal", user_id: "u-1", account_id: "a-1", video_title: "normal", content: null, published_at: "2026-09-01", anomaly_status: "normal" },
    { id: "v-deleted", user_id: "u-1", account_id: "a-1", video_title: "deleted", content: null, published_at: "2026-09-01", anomaly_status: "deleted" },
    { id: "v-halved", user_id: "u-1", account_id: "a-1", video_title: "halved", content: null, published_at: "2026-09-01", play_change_signal: "halve" },
  ];

  assert.deepEqual(
    filterContentVideos(anomalyVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, onlyAnomaly: true }).map((v) => v.id),
    ["v-deleted", "v-halved"],
  );
  assert.deepEqual(
    filterContentVideos(anomalyVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, onlyAnomaly: false }).map((v) => v.id),
    ["v-normal", "v-deleted", "v-halved"],
  );
});

test("待处理异常开关 URL 可往返", () => {
  const source = new URLSearchParams("anomaly=1");
  assert.equal(parseContentListFilters(source).onlyAnomaly, true);

  const written = writeContentListFilters(new URLSearchParams(), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    onlyAnomaly: true,
  });
  assert.equal(written.get("anomaly"), "1");

  const reset = writeContentListFilters(written, DEFAULT_CONTENT_LIST_FILTERS);
  assert.equal(reset.has("anomaly"), false);
});

// ===== 选题库状态筛选 =====

test("选题库状态按已入库/已移出精准过滤并支持 URL 往返", () => {
  const topicVideos = [
    { id: "v-in", user_id: "u-1", account_id: "a-1", video_title: "in", content: null, published_at: "2026-09-01", topic_library_status: "in_library" },
    { id: "v-out", user_id: "u-1", account_id: "a-1", video_title: "out", content: null, published_at: "2026-09-01", topic_library_status: "removed" },
    { id: "v-none", user_id: "u-1", account_id: "a-1", video_title: "none", content: null, published_at: "2026-09-01" },
  ];

  assert.deepEqual(
    filterContentVideos(topicVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, topicStatus: "in_library" }).map((v) => v.id),
    ["v-in"],
  );
  assert.deepEqual(
    filterContentVideos(topicVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, topicStatus: "removed" }).map((v) => v.id),
    ["v-out"],
  );

  const source = new URLSearchParams("topicStatus=in_library");
  assert.equal(parseContentListFilters(source).topicStatus, "in_library");

  const written = writeContentListFilters(new URLSearchParams(), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    topicStatus: "in_library",
  });
  assert.equal(written.get("topicStatus"), "in_library");
});

// ===== 时间切片与次级筛选显式化 =====

test("时间切片预设支持 yesterday、7d、30d、thisMonth 并在 URL 中精简记录", () => {
  const source = new URLSearchParams("timeRange=yesterday");
  assert.equal(parseContentListFilters(source).timeRange, "yesterday");

  const written = writeContentListFilters(new URLSearchParams(), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    timeRange: "7d",
  });
  assert.equal(written.get("timeRange"), "7d");
  assert.equal(written.has("startDate"), false, "预设时间不污染 startDate");
});

test("次级筛选汇总在无条件时安静，在有条件时显式打印各生效维度", () => {
  // 1. 无条件
  const emptySummary = getSecondaryFilterSummary(DEFAULT_CONTENT_LIST_FILTERS);
  assert.equal(emptySummary.isActive, false);
  assert.equal(emptySummary.label, "筛选");

  // 2. 单条件：流量
  const trafficSummary = getSecondaryFilterSummary({
    ...DEFAULT_CONTENT_LIST_FILTERS,
    playBucket: "ge5w",
  });
  assert.equal(trafficSummary.isActive, true);
  assert.equal(trafficSummary.label, "≥5万");

  // 3. 双条件：流量 + 评级
  const comboSummary = getSecondaryFilterSummary({
    ...DEFAULT_CONTENT_LIST_FILTERS,
    playBucket: "ge5w",
    qualityGrade: "excellent",
  });
  assert.equal(comboSummary.isActive, true);
  assert.equal(comboSummary.label, "≥5万 · 综合优");

  // 4. 多条件：选题库 + 流量 + 评级
  const tripleSummary = getSecondaryFilterSummary({
    ...DEFAULT_CONTENT_LIST_FILTERS,
    topicStatus: "in_library",
    playBucket: "ge5w",
    qualityGrade: "excellent",
  });
  assert.equal(tripleSummary.isActive, true);
  assert.equal(tripleSummary.label, "已入库 · ≥5万 +1");
});

