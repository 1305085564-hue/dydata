import assert from "node:assert/strict";
import test from "node:test";

import { __internal, ADMIN_CONTENT_INITIAL_LIMIT } from "./admin-content-page";
import { __internal as videosInternal, ADMIN_VIDEOS_INITIAL_LIMIT } from "./admin-videos-page";

test("内容管理首屏视频查询只选择页面需要的字段", () => {
  assert.equal(__internal.CONTENT_VIDEO_SELECT.includes("*"), false);
  assert.match(__internal.CONTENT_VIDEO_SELECT, /video_title/);
  assert.match(__internal.CONTENT_VIDEO_SELECT, /accounts!inner\(name, profile_id\)/);
  assert.match(__internal.CONTENT_VIDEO_SELECT, /profiles!videos_user_id_fkey!inner\(name\)/);
});

test("内容管理截图查询只选择列表和详情需要的指标字段", () => {
  assert.equal(__internal.CONTENT_SNAPSHOT_SELECT.includes("*"), false);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /play_count/);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /bounce_rate_2s/);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /completion_rate_5s/);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /favorites/);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /screenshot_urls/);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /curve_screenshot_url/);
  assert.match(__internal.CONTENT_SNAPSHOT_SELECT, /retention_screenshot_url/);
});

test("内容管理兼容 Supabase 关联对象或数组返回", () => {
  const [objectRow, arrayRow] = __internal.normalizeVideoRows([
    {
      id: "video-1",
      account_id: "account-1",
      user_id: "user-1",
      video_url: null,
      video_title: "对象关联",
      content: null,
      published_at: null,
      uploaded_at: "2026-04-30T00:00:00.000Z",
      anomaly_status: "正常",
      created_at: "2026-04-30T00:00:00.000Z",
      accounts: { name: "账号A" },
      profiles: { name: "成员A" },
    },
    {
      id: "video-2",
      account_id: "account-2",
      user_id: "user-2",
      video_url: null,
      video_title: "数组关联",
      content: null,
      published_at: null,
      uploaded_at: "2026-04-30T00:00:00.000Z",
      anomaly_status: "正常",
      created_at: "2026-04-30T00:00:00.000Z",
      accounts: [{ name: "账号B" }],
      profiles: [{ name: "成员B" }],
    },
  ]);

  assert.equal(objectRow.accounts.name, "账号A");
  assert.equal(objectRow.profiles.name, "成员A");
  assert.equal(arrayRow.accounts.name, "账号B");
  assert.equal(arrayRow.profiles.name, "成员B");
});

test("内容管理首屏默认只下发第一页视频", () => {
  const rows = Array.from({ length: ADMIN_CONTENT_INITIAL_LIMIT + 5 }, (_, index) => ({
    id: `video-${index}`,
    created_at: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const initialRows = __internal.limitInitialVideos(rows, "initial");
  const fullRows = __internal.limitInitialVideos(rows, "full");

  assert.equal(initialRows.length, ADMIN_CONTENT_INITIAL_LIMIT);
  assert.equal(initialRows[0]?.id, "video-0");
  assert.equal(initialRows.at(-1)?.id, `video-${ADMIN_CONTENT_INITIAL_LIMIT - 1}`);
  assert.equal(fullRows.length, ADMIN_CONTENT_INITIAL_LIMIT + 5);
});

function buildContentVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: "video",
    account_id: "account-1",
    user_id: "user-1",
    video_url: null,
    video_title: "测试视频",
    content: null,
    published_at: "2026-05-03T00:00:00.000Z",
    uploaded_at: "2026-05-03T00:00:00.000Z",
    anomaly_status: "正常" as const,
    created_at: "2026-05-03T00:00:00.000Z",
    accounts: { name: "账号A" },
    profiles: { name: "成员A" },
    ...overrides,
  };
}

test("内容管理播放涨跌信号按 published_at 找同账号上一条", () => {
  const rows = __internal.attachPlayChangeSignals({
    videos: [
      buildContentVideo({ id: "current", published_at: "2026-05-03T00:00:00.000Z" }),
      buildContentVideo({ id: "drop", published_at: "2026-05-02T00:00:00.000Z" }),
    ],
    currentSnapshots: [
      { video_id: "current", play_count: 12_000, captured_at: "2026-05-04T00:00:00.000Z" },
      { video_id: "drop", play_count: 5_000, captured_at: "2026-05-03T00:00:00.000Z" },
    ],
    previousVideos: [
      { id: "previous", account_id: "account-1", published_at: "2026-05-02T12:00:00.000Z" },
      { id: "drop-previous", account_id: "account-1", published_at: "2026-05-01T00:00:00.000Z" },
    ],
    previousSnapshots: [
      { video_id: "previous", play_count: 5_000, captured_at: "2026-05-03T12:00:00.000Z" },
      { video_id: "drop-previous", play_count: 10_500, captured_at: "2026-05-02T00:00:00.000Z" },
    ],
  });

  assert.equal(rows[0]?.previous_play_count, 5_000);
  assert.equal(rows[0]?.play_count_change_pct, 140);
  assert.equal(rows[0]?.play_change_signal, "surge");
  assert.equal(rows[1]?.previous_play_count, 10_500);
  assert.equal(rows[1]?.play_count_change_pct, -52.38095238095239);
  assert.equal(rows[1]?.play_change_signal, "halve");
});

test("内容管理播放涨跌无上一条时不展示信号", () => {
  const [row] = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "current" })],
    currentSnapshots: [{ video_id: "current", play_count: 300, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [],
    previousSnapshots: [],
  });

  assert.equal(row?.previous_play_count, null);
  assert.equal(row?.play_count_change_pct, null);
  assert.equal(row?.play_change_signal, null);
});

test("内容管理播放涨跌上一条播放为 0 时不展示信号", () => {
  const [row] = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "current" })],
    currentSnapshots: [{ video_id: "current", play_count: 300, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [{ id: "previous", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" }],
    previousSnapshots: [{ video_id: "previous", play_count: 0, captured_at: "2026-05-03T00:00:00.000Z" }],
  });

  assert.equal(row?.previous_play_count, 0);
  assert.equal(row?.play_count_change_pct, null);
  assert.equal(row?.play_change_signal, null);
});

test("内容管理小基数翻倍不展示信号", () => {
  const [row] = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "current" })],
    currentSnapshots: [{ video_id: "current", play_count: 9_000, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [{ id: "previous", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" }],
    previousSnapshots: [{ video_id: "previous", play_count: 4_500, captured_at: "2026-05-03T00:00:00.000Z" }],
  });

  assert.equal(row?.previous_play_count, 4_500);
  assert.equal(row?.play_count_change_pct, 100);
  assert.equal(row?.play_change_signal, null);
});

test("内容管理绝对增量超过 5000 的翻倍仍展示信号", () => {
  const [row] = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "current" })],
    currentSnapshots: [{ video_id: "current", play_count: 31_000, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [{ id: "previous", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" }],
    previousSnapshots: [{ video_id: "previous", play_count: 1_176, captured_at: "2026-05-03T00:00:00.000Z" }],
  });

  assert.equal(row?.previous_play_count, 1_176);
  assert.equal(row?.play_count_change_pct, 2536.0544217687075);
  assert.equal(row?.play_change_signal, "surge");
});

test("内容管理小基数腰斩不展示信号", () => {
  const [row] = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "current" })],
    currentSnapshots: [{ video_id: "current", play_count: 4_900, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [{ id: "previous", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" }],
    previousSnapshots: [{ video_id: "previous", play_count: 10_000, captured_at: "2026-05-03T00:00:00.000Z" }],
  });

  assert.equal(row?.previous_play_count, 10_000);
  assert.equal(row?.play_count_change_pct, -51);
  assert.equal(row?.play_change_signal, null);
});

test("内容管理播放涨跌信号阈值合同固定为涨幅增量 5000 与腰斩底线 5000", () => {
  assert.equal(__internal.PLAY_CHANGE_SURGE_DELTA_MIN, 5_000);
  assert.equal(__internal.PLAY_CHANGE_HALVE_CURRENT_FLOOR, 5_000);
});

test("内容管理首屏与 full 回填使用同一套播放涨跌阈值", () => {
  const lowBaseSurge = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "surge-low-base" })],
    currentSnapshots: [{ video_id: "surge-low-base", play_count: 9_000, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [{ id: "surge-prev", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" }],
    previousSnapshots: [{ video_id: "surge-prev", play_count: 4_800, captured_at: "2026-05-03T00:00:00.000Z" }],
  })[0];

  const lowFloorHalve = __internal.attachPlayChangeSignals({
    videos: [buildContentVideo({ id: "halve-low-floor" })],
    currentSnapshots: [{ video_id: "halve-low-floor", play_count: 4_800, captured_at: "2026-05-04T00:00:00.000Z" }],
    previousVideos: [{ id: "halve-prev", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" }],
    previousSnapshots: [{ video_id: "halve-prev", play_count: 12_000, captured_at: "2026-05-03T00:00:00.000Z" }],
  })[0];

  assert.equal(lowBaseSurge?.play_change_signal, null);
  assert.equal(lowFloorHalve?.play_change_signal, null);
});

test("内容管理首屏 RPC 结果会按服务端统一规则兜底校正", () => {
  const rows = __internal.enforcePlayChangeThresholdsOnVideos([
    buildContentVideo({
      id: "old-rpc-low-surge",
      previous_play_count: 4_800,
      play_count_change_pct: 87.5,
      play_change_signal: "surge",
    }),
    buildContentVideo({
      id: "valid-surge",
      previous_play_count: 1_176,
      play_count_change_pct: 2536.0544217687075,
      play_change_signal: "surge",
    }),
  ], [
    { video_id: "old-rpc-low-surge", play_count: 9_000, captured_at: "2026-05-04T00:00:00.000Z" },
    { video_id: "valid-surge", play_count: 31_000, captured_at: "2026-05-04T00:00:00.000Z" },
  ]);

  assert.equal(rows[0]?.play_change_signal, null);
  assert.equal(rows[0]?.play_count_change_pct, null);
  assert.equal(rows[1]?.play_change_signal, "surge");
  assert.equal(rows[1]?.play_count_change_pct, 2536.0544217687075);
});

test("内容管理首屏条数合同收紧到 20", () => {
  assert.equal(ADMIN_CONTENT_INITIAL_LIMIT, 20);
});

test("内容管理播放涨跌不用 created_at 或 uploaded_at 判断上一条", () => {
  const previousByVideoId = __internal.findPreviousVideoByVisibleId(
    [
      buildContentVideo({
        id: "current",
        published_at: "2026-05-03T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
        uploaded_at: "2026-05-01T00:00:00.000Z",
      }),
    ],
    [
      { id: "published-before", account_id: "account-1", published_at: "2026-05-02T00:00:00.000Z" },
      { id: "published-after", account_id: "account-1", published_at: "2026-05-04T00:00:00.000Z" },
    ],
  );

  assert.equal(previousByVideoId.get("current")?.id, "published-before");
});

test("素材库首屏默认只下发第一页视频", () => {
  const rows = Array.from({ length: ADMIN_VIDEOS_INITIAL_LIMIT + 5 }, (_, index) => ({
    id: `video-${index}`,
  }));

  const initialRows = videosInternal.limitInitialVideos(rows, "initial");
  const fullRows = videosInternal.limitInitialVideos(rows, "full");

  assert.equal(initialRows.length, ADMIN_VIDEOS_INITIAL_LIMIT);
  assert.equal(initialRows.at(-1)?.id, `video-${ADMIN_VIDEOS_INITIAL_LIMIT - 1}`);
  assert.equal(fullRows.length, ADMIN_VIDEOS_INITIAL_LIMIT + 5);
});

test("素材库首屏视频和快照查询只选择需要字段", () => {
  assert.equal(videosInternal.VIDEO_ASSET_SELECT.includes("*"), false);
  assert.match(videosInternal.VIDEO_ASSET_SELECT, /asset_level/);
  assert.match(videosInternal.VIDEO_ASSET_SELECT, /accounts!inner\(name, profile_id\)/);
  assert.equal(videosInternal.VIDEO_SNAPSHOT_SELECT.includes("*"), false);
  assert.match(videosInternal.VIDEO_SNAPSHOT_SELECT, /play_count/);
  assert.match(videosInternal.VIDEO_SNAPSHOT_SELECT, /completion_rate_5s/);
});

test("素材库兼容 Supabase 关联对象或数组返回", () => {
  const [objectRow, arrayRow] = videosInternal.normalizeVideoRows([
    {
      id: "video-1",
      account_id: "account-1",
      user_id: "user-1",
      video_url: null,
      video_title: "对象关联",
      content: null,
      published_at: null,
      uploaded_at: "2026-04-30T00:00:00.000Z",
      anomaly_status: "正常",
      created_at: "2026-04-30T00:00:00.000Z",
      accounts: { name: "账号A", profile_id: "profile-a" },
      profiles: { name: "成员A" },
    },
    {
      id: "video-2",
      account_id: "account-2",
      user_id: "user-2",
      video_url: null,
      video_title: "数组关联",
      content: null,
      published_at: null,
      uploaded_at: "2026-04-30T00:00:00.000Z",
      anomaly_status: "正常",
      created_at: "2026-04-30T00:00:00.000Z",
      accounts: [{ name: "账号B", profile_id: "profile-b" }],
      profiles: [{ name: "成员B" }],
    },
  ]);

  assert.equal(objectRow.accounts.name, "账号A");
  assert.equal(objectRow.accounts.profile_id, "profile-a");
  assert.equal(arrayRow.accounts.name, "账号B");
  assert.equal(arrayRow.accounts.profile_id, "profile-b");
  assert.equal(arrayRow.profiles.name, "成员B");
});

test("素材库首屏候选池大于最终下发数量", () => {
  assert.equal(
    videosInternal.ADMIN_VIDEOS_INITIAL_CANDIDATE_LIMIT > ADMIN_VIDEOS_INITIAL_LIMIT,
    true,
  );
});

test("后台首屏候选池保持克制，避免一次抓取过多视频", () => {
  assert.equal(__internal.ADMIN_CONTENT_INITIAL_CANDIDATE_LIMIT, 60);
  assert.equal(videosInternal.ADMIN_VIDEOS_INITIAL_CANDIDATE_LIMIT, 60);
});

test("内容管理 full 查询会按批次拆分，避免大 video_id in 查询失败", async () => {
  const ids = Array.from({ length: __internal.FULL_QUERY_BATCH_SIZE * 2 + 5 }, (_, index) => `video-${index}`);
  const batches: string[][] = [];

  const rows = await __internal.selectInBatches<{ video_id: string }>(ids, async (batch) => {
    batches.push(batch);
    return {
      data: batch.map((videoId) => ({ video_id: videoId })),
    };
  });

  assert.equal(batches.length, 3);
  assert.equal(batches[0]?.length, __internal.FULL_QUERY_BATCH_SIZE);
  assert.equal(batches[1]?.length, __internal.FULL_QUERY_BATCH_SIZE);
  assert.equal(batches[2]?.length, 5);
  assert.deepEqual(rows.map((row) => row.video_id), ids);
});

test("内容管理首屏改走 read-model RPC", () => {
  assert.equal(typeof __internal.ADMIN_CONTENT_FIRST_SCREEN_RPC, "string");
  assert.equal(__internal.ADMIN_CONTENT_FIRST_SCREEN_RPC, "admin_content_first_screen");
});

test("素材库首屏改走 read-model RPC", () => {
  assert.equal(typeof videosInternal.ADMIN_VIDEOS_FIRST_SCREEN_RPC, "string");
  assert.equal(videosInternal.ADMIN_VIDEOS_FIRST_SCREEN_RPC, "admin_videos_first_screen");
});
