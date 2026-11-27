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
const resumeSubmissionSource = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/fulfillment/appeal/_resume-submission.ts"),
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
  // 写入侧与读取侧必须同时存在：提交触发补交时记录原始 payload，补交确认时显式回传。
  assert.match(submitControllerSource, /setPendingSubmissionPayload\?\.\(submissionPayload\)/);
  assert.match(submitControllerSource, /submissionPayload,/);
});

test("补交审批工作台必须提供受权限保护的待审列表 GET", () => {
  assert.match(appealsRoute, /export async function GET\(request: NextRequest\)/);
  assert.match(appealsRoute, /requireAdminServiceClient\(\)/);
  assert.match(appealsRoute, /from\("fulfillment_appeals"\)/);
  assert.match(appealsRoute, /filterScopedRows\(auth\.scope/);
  assert.match(appealsRoute, /appeals:/);
});

test("审批通知必须进入自动续交入口，续交成功后清空暂存数据", () => {
  assert.match(handleRoute, /resumeAppeal=\$\{encodeURIComponent\(payload\.data\.appealId\)\}/);
  assert.match(resumeRoute, /resumeAppealSubmission\(appealId, admin/);
  assert.match(resumeSubmissionSource, /status !== "approved"/);
  assert.match(resumeSubmissionSource, /buildVideoSubmitResponse\(/);
  assert.match(resumeSubmissionSource, /update\(\{ submission_payload: null \}\)/);
});

test("数据库为补交申请提供可清空的暂存提交载荷", () => {
  assert.match(payloadMigration, /alter\s+table\s+public\.fulfillment_appeals/i);
  assert.match(payloadMigration, /add\s+column\s+if\s+not\s+exists\s+submission_payload\s+jsonb/i);
});
