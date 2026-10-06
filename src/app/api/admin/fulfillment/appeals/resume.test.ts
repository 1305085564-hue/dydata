import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appealsRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/fulfillment/appeals/route.ts"),
  "utf8",
);
const resumeRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/fulfillment/appeals/resume/route.ts"),
  "utf8",
);
const submitControllerSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-form-v2/submit-controller.ts"),
  "utf8",
);
const handleRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/fulfillment/appeal/handle/route.ts"),
  "utf8",
);
const payloadMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261003132000_fulfillment_appeal_submission_payload.sql"),
  "utf8",
);

test("补交申请必须保存原始待续交数据，而不是只保存补交原因", () => {
  assert.match(appealsRoute, /validateVideoSubmitPayload\(submissionPayload\)/);
  assert.match(appealsRoute, /submission_payload:\s*submissionPayload/);
  // 写入侧与读取侧必须同时存在：提交失败时把原始 payload 存进 ref，补交时按最新写入值读回。
  // 只校验其中一侧时，另一侧被删除（丢字段或重新猜测字段）测试仍会全绿。
  assert.match(submitControllerSource, /pendingSubmissionPayloadRef\.current = submissionPayload;/);
  assert.match(submitControllerSource, /submissionPayload:\s*pendingSubmissionPayloadRef\.current,/);
});

test("审批通知必须进入自动续交入口，续交成功后清空暂存数据", () => {
  assert.match(handleRoute, /resumeAppeal=\$\{encodeURIComponent\(payload\.data\.appealId\)\}/);
  assert.match(resumeRoute, /from\("fulfillment_appeals"\)/);
  assert.match(resumeRoute, /status !== "approved"/);
  assert.match(resumeRoute, /submitVideo\(submitRequest\)/);
  assert.match(resumeRoute, /update\(\{ submission_payload: null \}\)/);
});

test("数据库为补交申请提供可清空的暂存提交载荷", () => {
  assert.match(payloadMigration, /alter\s+table\s+public\.fulfillment_appeals/i);
  assert.match(payloadMigration, /add\s+column\s+if\s+not\s+exists\s+submission_payload\s+jsonb/i);
});
