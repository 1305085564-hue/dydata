import test from "node:test";
import assert from "node:assert/strict";

import { buildFeedbackReplyMutation, submitFeedbackReply } from "./content-feedback-replies";

test("submitFeedbackReply 通过单个 RPC 原子写入回复和反馈卡状态", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const card = {
    id: "card-1",
    video_id: "video-1",
    target_user_id: "user-1",
    card_status: "viewed",
    employee_reply_status: "acknowledged",
  };
  const supabase = {
    rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return Promise.resolve({ data: [card], error: null });
    },
  };

  const result = await submitFeedbackReply({
    supabase: supabase as never,
    cardId: "card-1",
    actorUserId: "user-1",
    replyStatus: "acknowledged",
    replyText: "收到，我会调整。",
  });

  assert.equal(result.id, "card-1");
  assert.deepEqual(calls, [{
    name: "submit_feedback_card_reply",
    params: {
      p_card_id: "card-1",
      p_actor_user_id: "user-1",
      p_reply_status: "acknowledged",
      p_reply_text: "收到，我会调整。",
    },
  }]);
});

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
