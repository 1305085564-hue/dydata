import assert from "node:assert/strict";
import test from "node:test";

import { __internal, ADMIN_CONTENT_INITIAL_LIMIT } from "./admin-content-page";

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
