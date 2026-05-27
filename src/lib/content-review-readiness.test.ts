import test from "node:test";
import assert from "node:assert/strict";

import { buildContentFeedbackCardView } from "./content-feedback-cards";
import { buildContentReviewReadiness } from "./content-review-readiness";

test("buildContentReviewReadiness 在缺拆段时允许自动生成草稿", () => {
  const feedbackCard = buildContentFeedbackCardView("video-1", null);
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "先说结论，再拆原因，最后给操作建议。" },
    feedbackCard,
    hasSnapshot24h: true,
    hasSegments: false,
  });

  assert.equal(readiness.status, "missing_segments");
  assert.equal(readiness.label, "缺拆段");
  assert.equal(readiness.can_generate, true);
});

test("buildContentReviewReadiness 在缺24h数据时阻止生成", () => {
  const feedbackCard = buildContentFeedbackCardView("video-1", null);
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "已有文案" },
    feedbackCard,
    hasSnapshot24h: false,
    hasSegments: true,
  });

  assert.equal(readiness.status, "missing_snapshot");
  assert.equal(readiness.can_generate, false);
});

test("buildContentReviewReadiness 已有反馈卡时优先显示流程状态", () => {
  const feedbackCard = buildContentFeedbackCardView("video-1", {
    id: "card-1",
    video_id: "video-1",
    card_status: "draft",
    manager_note: null,
    draft_payload: null,
    confirmed_payload: null,
    draft_generated_at: "2026-05-27T00:00:00.000Z",
    confirmed_at: null,
    sent_at: null,
    viewed_at: null,
  });
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "" },
    feedbackCard,
    hasSnapshot24h: false,
    hasSegments: false,
  });

  assert.equal(readiness.status, "draft");
  assert.equal(readiness.label, "AI初稿待确认");
  assert.equal(readiness.can_generate, false);
});
