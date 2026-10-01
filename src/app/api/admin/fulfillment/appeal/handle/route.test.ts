import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFulfillmentAppealRejectionAuditDetail,
  buildFulfillmentAppealRejectionNotification,
  parseHandleFulfillmentAppealPayload,
} from "./route";

const APPEAL_ID = "123e4567-e89b-42d3-a456-426614174000";

test("handle fulfillment appeal payload 校验 uuid 和 decision", () => {
  const invalidId = parseHandleFulfillmentAppealPayload({ appealId: "bad", decision: "approve" });
  assert.equal("response" in invalidId && invalidId.response.status, 400);

  const invalidDecision = parseHandleFulfillmentAppealPayload({ appealId: APPEAL_ID, decision: "pass" });
  assert.equal("response" in invalidDecision && invalidDecision.response.status, 400);

  const valid = parseHandleFulfillmentAppealPayload({ appealId: APPEAL_ID, decision: "reject" });
  assert.equal("response" in valid && valid.response.status, 400);

  const validWithReason = parseHandleFulfillmentAppealPayload({
    appealId: APPEAL_ID,
    decision: "reject",
    reason: "发布时间截图与平台记录不一致",
  });
  assert.deepEqual("data" in validWithReason && validWithReason.data, {
    appealId: APPEAL_ID,
    decision: "reject",
    reason: "发布时间截图与平台记录不一致",
  });
});

test("同意补交不要求驳回原因，原因长度受限", () => {
  const approved = parseHandleFulfillmentAppealPayload({
    appealId: APPEAL_ID,
    decision: "approve",
  });
  assert.deepEqual("data" in approved && approved.data, {
    appealId: APPEAL_ID,
    decision: "approve",
  });

  const tooLong = parseHandleFulfillmentAppealPayload({
    appealId: APPEAL_ID,
    decision: "reject",
    reason: "x".repeat(1001),
  });
  assert.equal("response" in tooLong && tooLong.response.status, 400);
});

test("驳回原因只进入通知和审计详情，不进入补交单 payload", () => {
  const reason = "请核对平台真实发布时间后再提交";
  assert.equal(
    buildFulfillmentAppealRejectionNotification("2026-10-01", reason),
    "2026-10-01 的数据补交申请已被驳回。驳回原因：请核对平台真实发布时间后再提交",
  );
  assert.deepEqual(
    JSON.parse(
      buildFulfillmentAppealRejectionAuditDetail({
        appealId: APPEAL_ID,
        accountId: "account-1",
        recordDate: "2026-10-01",
        reason,
      }),
    ),
    {
      appealId: APPEAL_ID,
      accountId: "account-1",
      recordDate: "2026-10-01",
      decision: "rejected",
      reason,
    },
  );
});
