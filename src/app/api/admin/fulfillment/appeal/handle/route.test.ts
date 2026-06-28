import assert from "node:assert/strict";
import test from "node:test";

import { parseHandleFulfillmentAppealPayload } from "./route";

const APPEAL_ID = "123e4567-e89b-42d3-a456-426614174000";

test("handle fulfillment appeal payload 校验 uuid 和 decision", () => {
  const invalidId = parseHandleFulfillmentAppealPayload({ appealId: "bad", decision: "approve" });
  assert.equal("response" in invalidId && invalidId.response.status, 400);

  const invalidDecision = parseHandleFulfillmentAppealPayload({ appealId: APPEAL_ID, decision: "pass" });
  assert.equal("response" in invalidDecision && invalidDecision.response.status, 400);

  const valid = parseHandleFulfillmentAppealPayload({ appealId: APPEAL_ID, decision: "reject" });
  assert.deepEqual("data" in valid && valid.data, {
    appealId: APPEAL_ID,
    decision: "reject",
  });
});
