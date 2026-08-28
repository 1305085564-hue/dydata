import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardTopicHref,
  normalizeDashboardTopicId,
  normalizeDashboardTopicTitle,
} from "./dashboard-context";

const SUB_TOPIC_ID = "123e4567-e89b-12d3-a456-426614174000";

test("脚本中选题进入工作台时保留合法子题 ID", () => {
  assert.equal(
    buildDashboardTopicHref(` ${SUB_TOPIC_ID} `, "  涨停板怎么做  "),
    `/dashboard?topic_id=${SUB_TOPIC_ID}&topic_title=%E6%B6%A8%E5%81%9C%E6%9D%BF%E6%80%8E%E4%B9%88%E5%81%9A`,
  );
  assert.equal(normalizeDashboardTopicId(` ${SUB_TOPIC_ID} `), SUB_TOPIC_ID);
  assert.equal(normalizeDashboardTopicTitle("  涨停板  怎么做  "), "涨停板 怎么做");
});

test("工作台不接受空值或伪造的选题 ID", () => {
  assert.equal(buildDashboardTopicHref(""), "/dashboard");
  assert.equal(buildDashboardTopicHref("not-a-uuid"), "/dashboard");
  assert.equal(normalizeDashboardTopicId(undefined), null);
  assert.equal(normalizeDashboardTopicId("not-a-uuid"), null);
  assert.equal(normalizeDashboardTopicTitle("  "), null);
});
