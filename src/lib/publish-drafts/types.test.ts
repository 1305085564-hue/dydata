import test from "node:test";
import assert from "node:assert/strict";

import {
  isDraftStatus,
  parseApprovedDraftItem,
  parseFeedbackHistory,
  parsePublishDraft,
  parsePublishDraftActorScope,
  parseReviewQueueItem,
} from "./types";

test("发布稿件解析保留合法值并过滤错误历史项", () => {
  const draft = parsePublishDraft({
    id: "d1", submitted_by: "u1", script_text: "正文", status: "pending", current_round: 0,
    is_deleted: false, created_at: "2026-07-18", updated_at: "2026-07-18", screenshot_paths: ["a", 1],
    feedback_history: [{ round: 1, action: "reject", reviewer_id: "u2", feedback_text: null, at: "now" }, { round: null }],
  });

  assert.equal(draft?.current_round, 0);
  assert.deepEqual(draft?.screenshot_paths, ["a"]);
  assert.equal(draft?.feedback_history.length, 1);
});

test("空值和缺必填字段返回安全空结果", () => {
  assert.equal(isDraftStatus(null), false);
  assert.deepEqual(parseFeedbackHistory(null), []);
  assert.equal(parsePublishDraft(null), null);
  assert.equal(parsePublishDraftActorScope([]), null);
  assert.equal(parseReviewQueueItem({}), null);
  assert.equal(parseApprovedDraftItem({}), null);
});

test("审核范围兼容 RPC 数组包装", () => {
  assert.deepEqual(parsePublishDraftActorScope([{ can_review: true, business_role: "owner", visible_user_ids: ["u1", null] }]), {
    can_review: true,
    business_role: "owner",
    visible_user_ids: ["u1"],
  });
});
