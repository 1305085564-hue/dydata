import test from "node:test";
import assert from "node:assert/strict";
import { persistSubmissionTags, runSubmissionPersistencePipeline, runSubmissionPersistenceStep } from "./persist";
import { buildDailyReportPayload, buildScreenshotReplacementHistoryRows, buildSnapshotPayload } from "./persist";
import type { VideoSubmitValidationResult } from "./validation";

type Normalized = VideoSubmitValidationResult["normalized"];

function normalized(overrides: Partial<Normalized> = {}): Normalized {
  return {
    account_id: "account-1",
    mode: "create",
    video_id: "video-1",
    video_url: null,
    video_title: "标题",
    content: "文案",
    published_at: "2026-10-01T10:00:00+08:00",
    published_at_text: "2026年10月1日 10:00",
    biz_date: "2026-10-01",
    anomaly_status: "normal",
    punish_type: null,
    platform_notice: null,
    appeal: null,
    topic_tag: "复盘",
    topic_id: null,
    script_author_user_id: null,
    video_editor_user_id: null,
    operator_user_id: null,
    video_form: "出镜",
    content_keywords: [],
    script_text: null,
    script_format: "oral",
    manual_edit: false,
    screenshots_refreshed: false,
    assets: [],
    metrics: {
      play_count: 100,
      likes: 10,
      comments: 2,
      shares: 3,
      favorites: 4,
      follower_gain: 5,
      follower_loss: 0,
      follower_convert: 6,
      avg_play_duration: 12,
      bounce_rate_2s: 10,
      completion_rate_5s: 20,
      completion_rate: 30,
    },
    ...overrides,
  };
}

test("snapshot payload keeps OCR metadata and retention screenshot mapping", () => {
  const payload = buildSnapshotPayload(normalized({
    assets: [{
      role: "screenshot_2",
      url: "/api/submission-screenshots/file?path=user-1/retention.png",
      confirmed: true,
      confidence_score: 0.9,
      recognized_fields: { video_title: "标题" },
      screenshot_type: "retention",
    }],
  }), "video-1");

  assert.equal(payload.video_id, "video-1");
  assert.equal(payload.retention_screenshot_url, "/api/submission-screenshots/file?path=user-1/retention.png");
  assert.deepEqual(payload.vs_previous?.ocr_assets, [{
    role: "screenshot_2",
    screenshot_type: "retention",
    confidence_score: 0.9,
    confirmed: true,
    recognized_fields: { video_title: "标题" },
  }]);
});

test("截图留痕只记录变化的槽位，并保留可重复替换的旧新链接与服务端时间", () => {
  const existing = {
    screenshot_urls: ["/old/interaction.png", "/old/retention.png"],
    curve_screenshot_url: null,
    retention_screenshot_url: "/old/retention.png",
    vs_previous: null,
  };
  const firstReplacement = buildScreenshotReplacementHistoryRows({
    existing,
    assets: [
      { role: "screenshot_1", url: "/new/interaction-1.png", confirmed: true, confidence_score: 1 },
      { role: "screenshot_2", url: "/old/retention.png", confirmed: true, confidence_score: 1 },
    ],
    videoId: "video-1",
    accountId: "account-1",
    userId: "user-1",
    replacedAt: "2026-10-09T08:00:00.000Z",
  });

  assert.deepEqual(firstReplacement, [{
    video_id: "video-1",
    account_id: "account-1",
    user_id: "user-1",
    replaced_by: "user-1",
    role: "screenshot_1",
    replaced_at: "2026-10-09T08:00:00.000Z",
    old_url: "/old/interaction.png",
    new_url: "/new/interaction-1.png",
  }]);

  assert.deepEqual(buildScreenshotReplacementHistoryRows({
    existing: { ...existing, screenshot_urls: ["/new/interaction-1.png", "/old/retention.png"] },
    assets: [{ role: "screenshot_1", url: "/new/interaction-2.png", confirmed: true, confidence_score: 1 }],
    videoId: "video-1",
    accountId: "account-1",
    userId: "user-1",
    replacedAt: "2026-10-09T08:05:00.000Z",
  }), [{
    video_id: "video-1",
    account_id: "account-1",
    user_id: "user-1",
    replaced_by: "user-1",
    role: "screenshot_1",
    replaced_at: "2026-10-09T08:05:00.000Z",
    old_url: "/new/interaction-1.png",
    new_url: "/new/interaction-2.png",
  }]);
});

test("缺一张截图时留痕按身份认旧图，不按数组位置串图", () => {
  // 只有完播留存图：数组里只剩它，位置在第 0 位。按位置认会把完播错记成互动。
  assert.deepEqual(buildScreenshotReplacementHistoryRows({
    existing: {
      screenshot_urls: ["/old/retention.png"],
      retention_screenshot_url: "/old/retention.png",
    },
    assets: [{ role: "screenshot_2", url: "/new/retention.png", confirmed: true, confidence_score: 1 }],
    videoId: "video-1",
    accountId: "account-1",
    userId: "user-1",
    replacedAt: "2026-10-09T09:00:00.000Z",
  }), [{
    video_id: "video-1",
    account_id: "account-1",
    user_id: "user-1",
    replaced_by: "user-1",
    role: "screenshot_2",
    replaced_at: "2026-10-09T09:00:00.000Z",
    old_url: "/old/retention.png",
    new_url: "/new/retention.png",
  }]);

  // 只有互动数据图：完播链接为空，那张就该认成互动，不能落到 screenshot_2 上。
  assert.deepEqual(buildScreenshotReplacementHistoryRows({
    existing: {
      screenshot_urls: ["/old/interaction.png"],
      retention_screenshot_url: null,
    },
    assets: [{ role: "screenshot_1", url: "/new/interaction.png", confirmed: true, confidence_score: 1 }],
    videoId: "video-1",
    accountId: "account-1",
    userId: "user-1",
    replacedAt: "2026-10-09T09:05:00.000Z",
  }), [{
    video_id: "video-1",
    account_id: "account-1",
    user_id: "user-1",
    replaced_by: "user-1",
    role: "screenshot_1",
    replaced_at: "2026-10-09T09:05:00.000Z",
    old_url: "/old/interaction.png",
    new_url: "/new/interaction.png",
  }]);
});

test("edit daily report payload preserves the existing publish time", () => {
  const payload = buildDailyReportPayload({
    normalized: normalized({ mode: "edit", published_at: "2026-10-03T10:00:00+08:00" }),
    videoId: "video-1",
    userId: "user-1",
    submitter: "阿禅",
    nowIso: "2026-10-03T02:00:00.000Z",
    assigneeColumns: {
      script_author_user_id: "user-1",
      video_editor_user_id: "user-1",
      operator_user_id: "user-1",
    },
    existingVideo: { id: "video-1", published_at: "2026-10-01T10:00:00+08:00" },
  });

  assert.equal(payload.published_at, "2026-10-01T10:00:00+08:00");
  assert.equal(payload.completion_rate, "30%");
  assert.equal(payload.avg_play_duration, "12秒");
});
test("persistence step returns a stable stage code", async () => {
  const result = await runSubmissionPersistenceStep("snapshot", async () => ({
    data: null,
    error: new Error("db unavailable"),
  }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "SNAPSHOT_PERSIST_FAILED");
});

test("persistence step catches thrown database errors", async () => {
  const result = await runSubmissionPersistenceStep("report", async () => {
    throw new Error("network reset");
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "REPORT_PERSIST_FAILED");
});

test("persistence step compensates earlier writes before returning failure", async () => {
  const events: string[] = [];
  const result = await runSubmissionPersistenceStep(
    "report",
    async () => ({ data: null, error: new Error("write failed") }),
    async () => { events.push("rollback"); },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.compensated, true);
  assert.deepEqual(events, ["rollback"]);
});

test("persistence failure matrix compensates every declared write stage", async () => {
  const stages = ["video", "snapshot", "report", "tags", "usage", "source", "history"] as const;
  for (const stage of stages) {
    const events: string[] = [];
    const result = await runSubmissionPersistencePipeline(
      [{
        stage,
        run: async () => {
          events.push(`write:${stage}`);
          return { error: new Error(`${stage} failed`) };
        },
      }],
      async () => { events.push("rollback:all-core-writes"); },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.stage, stage);
      assert.equal(result.code, `${stage === "source" ? "REPORT_SOURCE" : stage === "history" ? "SCREENSHOT_HISTORY" : stage.toUpperCase()}_PERSIST_FAILED`);
      assert.equal(result.compensated, true);
    }
    assert.deepEqual(events, [`write:${stage}`, "rollback:all-core-writes"]);
  }
});

test("persistence pipeline stops at the first failure and never runs later writes", async () => {
  const events: string[] = [];
  const result = await runSubmissionPersistencePipeline(
    [
      { stage: "video", run: async () => { events.push("video"); return {}; } },
      { stage: "snapshot", run: async () => { events.push("snapshot"); return { error: new Error("stop") }; } },
      { stage: "report", run: async () => { events.push("report"); return {}; } },
    ],
    async () => { events.push("rollback"); },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(events, ["video", "snapshot", "rollback"]);
});

test("tag persistence restores the previous snapshot when AI or manual tag write fails", async () => {
  for (const failedStage of ["ai", "manual"] as const) {
    const events: string[] = [];
    const result = await persistSubmissionTags({
      loadPrevious: async () => ({ data: ["old-tag"], error: null }),
      generateAiTags: async () => [{ tag_dimension: "题材", tag_value: "复盘", confidence: 0.9, reason: null }],
      writeAiTags: async () => {
        events.push("ai");
        return failedStage === "ai" ? { error: { message: "ai write failed" } } : {};
      },
      writeManualTags: async () => {
        events.push("manual");
        return failedStage === "manual" ? { error: { message: "manual write failed" } } : {};
      },
      restorePrevious: async (rows) => { events.push(`restore:${rows.length}`); },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(events, failedStage === "ai" ? ["ai", "restore:1"] : ["ai", "manual", "restore:1"]);
  }
});
