import test from "node:test";
import assert from "node:assert/strict";

import { buildContentFeedbackReplyResponse } from "./route";

test("feedback reply route 缺少卡片 id 时拒绝", async () => {
  const response = await buildContentFeedbackReplyResponse(
    {},
    {
      requireAuthenticatedFeedbackUser: async () => ({ error: "未登录", status: 401 }),
      submitFeedbackReply: async () => {
        throw new Error("should not run");
      },
    },
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /cardId/);
});

test("feedback reply route 回传成功时返回更新后的反馈卡", async () => {
  const response = await buildContentFeedbackReplyResponse(
    {
      cardId: "card-1",
      replyStatus: "acknowledged",
      replyText: "收到，今晚改。",
    },
    {
      requireAuthenticatedFeedbackUser: async () => ({ userId: "user-1" }),
      submitFeedbackReply: async ({ cardId, actorUserId, replyStatus, replyText }) => ({
        id: cardId,
        video_id: "video-1",
        target_user_id: actorUserId,
        target_account_id: null,
        source_result_id: null,
        card_status: "viewed",
        manager_note: null,
        draft_payload: null,
        confirmed_payload: null,
        draft_generated_at: null,
        confirmed_by: null,
        confirmed_at: null,
        sent_by: null,
        sent_at: "2026-06-28T09:00:00.000Z",
        viewed_at: "2026-06-28T10:00:00.000Z",
        employee_reply_status: replyStatus,
        employee_reply_text: replyText,
        employee_replied_at: "2026-06-28T10:00:00.000Z",
        employee_replied_by: actorUserId,
        created_at: "2026-06-28T08:00:00.000Z",
        updated_at: "2026-06-28T10:00:00.000Z",
      }),
    },
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.feedback_card.workflow_status, "viewed");
  assert.equal(json.feedback_card.employee_reply_status, "acknowledged");
  assert.equal(json.feedback_card.employee_reply_text, "收到，今晚改。");
});

test("feedback reply route 不向浏览器暴露数据库原始错误", async () => {
  const response = await buildContentFeedbackReplyResponse(
    {
      cardId: "card-1",
      replyStatus: "acknowledged",
      replyText: "收到。",
    },
    {
      requireAuthenticatedFeedbackUser: async () => ({ userId: "user-1" }),
      submitFeedbackReply: async () => {
        throw new Error("relation public.feedback_card_replies does not exist");
      },
    },
  );

  assert.equal(response.status, 500);
  const body = JSON.stringify(await response.json());
  assert.match(body, /提交员工复盘失败/);
  assert.doesNotMatch(body, /feedback_card_replies|relation public/);
});
