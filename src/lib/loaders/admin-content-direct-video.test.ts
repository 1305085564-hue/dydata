import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminContentVideoDetail } from "./content-detail";

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
    // 详情与列表同源地计算播放涨跌信号，需要查同账号上一条作品（2026-10-11 审计 H1）
    lt() { return chain; },
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
        if (table === "video_tags") return query([{ tag_value: "干货" }], filters);
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
  assert.equal(detail?.topicKind, "dry_goods");
  // videos 出现两次：先取目标作品，再由 loadPlayChangeSignals 取同账号上一条作品比对涨跌
  assert.deepEqual(tables, ["videos", "video_metrics_snapshots", "video_content_segments", "video_tags", "videos"]);
  assert.deepEqual(filters.slice(0, 2), ["id=video-1", "lifecycle_state=active"]);
});

test("详情载荷带上播放涨跌信号字段，与列表同源（审计 H1：详情与列表必须同一口径）", async () => {
  // 同账号上一条作品播放 10000，本作品 24h 播放 1000（跌 90%）：
  // 腰斩已下线（2026-10-14），信号值为 null，但字段必须存在、口径与列表一致
  const previousVideo = { ...videoRow("member-1"), id: "video-prev", published_at: "2026-09-01T08:00:00.000Z" };
  const detail = await loadAdminContentVideoDetail({
    supabase: {
      from(table: string) {
        if (table === "videos") return query(videoRow("member-1"));
        if (table === "video_metrics_snapshots") {
          return query([{
            id: "snapshot-1",
            video_id: "video-1",
            snapshot_type: "24h",
            captured_at: "2026-09-08T08:00:00.000Z",
            play_count: 1000,
          }]);
        }
        if (table === "video_content_segments") return query([{ video_id: "video-1" }]);
        if (table === "video_tags") return query([{ tag_value: "干货" }]);
        // 第二步取同账号上一条作品
        if (table === "videos") return query(previousVideo);
        throw new Error(`unexpected table: ${table}`);
      },
    } as never,
    scope: { visibleUserIds: ["member-1"] } as never,
    videoId: "video-1",
  });

  assert.ok(detail);
  // 关键：字段本身必须出现在详情载荷里，否则前端再怎么传参也拿不到涨跌信号
  assert.equal(
    Object.prototype.hasOwnProperty.call(detail.video, "play_change_signal"),
    true,
    "详情视频缺少 play_change_signal，前端无法与列表显示同一状态",
  );
  // 腰斩下线后深跌不再产出 halve 标签信号
  assert.equal(detail.video.play_change_signal, null);
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
