import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminContentVideoDetail } from "./admin-content-page";

function query(data: unknown, filters?: string[]) {
  const value = { data, error: null };
  const chain = {
    select() { return chain; },
    eq(column: string, value: string) {
      filters?.push(`${column}=${value}`);
      return chain;
    },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle() { return Promise.resolve(value); },
    then(resolve: (result: typeof value) => unknown) { return Promise.resolve(value).then(resolve); },
  };
  return chain;
}

function videoRow(ownerId: string) {
  return {
    id: "video-1",
    account_id: "account-1",
    user_id: ownerId,
    video_url: "https://example.com/video",
    video_title: "作品标题",
    content: "这是作品文案",
    published_at: "2026-09-07T08:00:00.000Z",
    uploaded_at: "2026-09-07T08:00:00.000Z",
    anomaly_status: null,
    created_at: "2026-09-07T08:00:00.000Z",
    accounts: { name: "账号一", profile_id: ownerId },
    profiles: { name: "创作者" },
  };
}

test("指定 videoId 直查该视频的真实文案和 24 小时截图，不读取待盘队列", async () => {
  const tables: string[] = [];
  const filters: string[] = [];
  const detail = await loadAdminContentVideoDetail({
    supabase: {
      from(table: string) {
        tables.push(table);
        if (table === "videos") return query(videoRow("member-1"), filters);
        if (table === "video_metrics_snapshots") {
          return query([{
            id: "snapshot-1",
            video_id: "video-1",
            snapshot_type: "24h",
            captured_at: "2026-09-08T08:00:00.000Z",
            play_count: 5000,
            screenshot_urls: ["https://example.com/screenshot"],
            curve_screenshot_url: null,
            retention_screenshot_url: null,
          }], filters);
        }
        if (table === "video_content_segments") return query([{ video_id: "video-1" }], filters);
        throw new Error(`unexpected table: ${table}`);
      },
    } as never,
    scope: { visibleUserIds: ["member-1"] } as never,
    videoId: "video-1",
  });

  assert.equal(detail?.video.id, "video-1");
  assert.equal(detail?.video.content, "这是作品文案");
  assert.equal(detail?.snapshot?.screenshot_urls?.[0], "https://example.com/screenshot");
  assert.equal(detail?.reviewReadiness["video-1"].has_snapshot_24h, true);
  assert.deepEqual(tables, ["videos", "video_metrics_snapshots", "video_content_segments"]);
  assert.deepEqual(filters.slice(0, 2), ["id=video-1", "lifecycle_state=active"]);
});

test("指定视频属于当前范围外成员时不返回内容", async () => {
  const detail = await loadAdminContentVideoDetail({
    supabase: {
      from() {
        return query(videoRow("outside-member"));
      },
    } as never,
    scope: { visibleUserIds: ["member-1"] } as never,
    videoId: "video-outside-scope",
  });

  assert.equal(detail, null);
});
