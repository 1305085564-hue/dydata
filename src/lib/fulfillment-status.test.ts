import assert from "node:assert/strict";
import test from "node:test";

import {
  FULFILLED_FULFILLMENT_STATUSES,
  MANUAL_FULFILLMENT_MARK_STATUSES,
  REQUIRED_EXCLUDED_FULFILLMENT_STATUSES,
  WAIVED_FULFILLMENT_STATUSES,
  countsTowardFulfillmentRequirement,
  isFulfilledFulfillmentStatus,
  isManualFulfillmentMarkStatus,
  isWaivedFulfillmentStatus,
} from "./fulfillment-status";

test("履约完成、豁免和应发扣减状态集合来自单一常量", () => {
  assert.deepEqual(FULFILLED_FULFILLMENT_STATUSES, ["published", "confirmed_published"]);
  assert.deepEqual(WAIVED_FULFILLMENT_STATUSES, ["waived", "exempted"]);
  assert.deepEqual(REQUIRED_EXCLUDED_FULFILLMENT_STATUSES, ["leave", "waived", "exempted"]);
  assert.deepEqual(MANUAL_FULFILLMENT_MARK_STATUSES, ["leave", "waived", "absent", "confirmed_published"]);
});

test("履约状态 helper 与月度统计语义一致", () => {
  assert.equal(isFulfilledFulfillmentStatus("published"), true);
  assert.equal(isFulfilledFulfillmentStatus("confirmed_published"), true);
  assert.equal(isWaivedFulfillmentStatus("waived"), true);
  assert.equal(isWaivedFulfillmentStatus("exempted"), true);
  assert.equal(countsTowardFulfillmentRequirement("leave"), false);
  assert.equal(countsTowardFulfillmentRequirement("waived"), false);
  assert.equal(countsTowardFulfillmentRequirement("exempted"), false);
  assert.equal(countsTowardFulfillmentRequirement("absent"), true);
  assert.equal(countsTowardFulfillmentRequirement("unconfirmed"), true);
  assert.equal(isManualFulfillmentMarkStatus("leave"), true);
  assert.equal(isManualFulfillmentMarkStatus("waived"), true);
  assert.equal(isManualFulfillmentMarkStatus("absent"), true);
  assert.equal(isManualFulfillmentMarkStatus("confirmed_published"), true);
  assert.equal(isManualFulfillmentMarkStatus("published"), false);
  assert.equal(isManualFulfillmentMarkStatus("exempted"), false);
});
