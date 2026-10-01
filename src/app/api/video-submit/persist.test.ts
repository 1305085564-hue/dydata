import test from "node:test";
import assert from "node:assert/strict";
import { runSubmissionPersistenceStep } from "./persist";
import { buildDailyReportPayload, buildSnapshotPayload } from "./persist";
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
