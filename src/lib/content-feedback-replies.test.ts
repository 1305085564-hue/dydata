import test from "node:test";
import assert from "node:assert/strict";

import { buildFeedbackReplyMutation } from "./content-feedback-replies";

test("buildFeedbackReplyMutation 首次员工回传时补齐 viewed 并写入 acknowledge", () => {
  const now = "2026-06-28T10:00:00.000Z";
  const mutation = buildFeedbackReplyMutation({
    currentStatus: "sent",
    currentViewedAt: null,
    replyStatus: "acknowledged",
    replyText: "收到，下一条我会先把前3秒结论前置。",
    actorUserId: "user-1",
    now,
  });

  assert.equal(mutation.card_status, "viewed");
  assert.equal(mutation.viewed_at, now);
  assert.equal(mutation.employee_reply_status, "acknowledged");
  assert.equal(mutation.employee_reply_text, "收到，下一条我会先把前3秒结论前置。");
  assert.equal(mutation.employee_replied_by, "user-1");
  assert.equal(mutation.employee_replied_at, now);
});

test("buildFeedbackReplyMutation 已查看后继续复盘，不覆盖原 viewed_at", () => {
  const mutation = buildFeedbackReplyMutation({
    currentStatus: "viewed",
    currentViewedAt: "2026-06-28T09:00:00.000Z",
    replyStatus: "disputed",
    replyText: "我认为问题不在开头，主要是投流干预。",
    actorUserId: "user-2",
    now: "2026-06-28T10:00:00.000Z",
  });

  assert.equal(mutation.card_status, "viewed");
  assert.equal(mutation.viewed_at, "2026-06-28T09:00:00.000Z");
  assert.equal(mutation.employee_reply_status, "disputed");
});

