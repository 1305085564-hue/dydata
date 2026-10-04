import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type { MutationObservation, MutationStage } from "@/lib/observed-mutation";
import { appendObservedMutationResult } from "@/lib/observed-mutation-result";

const routeContracts = [
  ["admin/fulfillment/appeals", "src/app/api/admin/fulfillment/appeals/route.ts"],
  ["admin/fulfillment/appeals/resume", "src/app/api/admin/fulfillment/appeals/resume/route.ts"],
  ["admin/fulfillment/appeal/reopen", "src/app/api/admin/fulfillment/appeal/reopen/route.ts"],
  ["admin/fulfillment/bulk-mark", "src/app/api/admin/fulfillment/bulk-mark/route.ts"],
  ["admin/fulfillment/remove", "src/app/api/admin/fulfillment/remove/route.ts"],
  ["admin/topics-library/evaluate", "src/app/api/admin/topics-library/evaluate/route.ts"],
  ["admin/topics-library/feishu-url", "src/app/api/admin/topics-library/feishu-url/route.ts"],
  ["admin/topics-library/import/confirm", "src/app/api/admin/topics-library/import/confirm/route.ts"],
  ["admin/topics-library/import/parse", "src/app/api/admin/topics-library/import/parse/route.ts"],
  ["admin/topics-library/toggle", "src/app/api/admin/topics-library/toggle/route.ts"],
  ["admin/ai-config", "src/app/api/admin/ai-config/route.ts"],
  ["admin/ai-config/check-dependencies", "src/app/api/admin/ai-config/check-dependencies/route.ts"],
  ["admin/ai-config/sync-models", "src/app/api/admin/ai-config/sync-models/route.ts"],
  ["admin/collaboration/attribution", "src/app/api/admin/collaboration/attribution/route.ts"],
  ["admin/collaboration/writer-certification", "src/app/api/admin/collaboration/writer-certification/route.ts"],
  ["admin/content/[videoId]/review-status", "src/app/api/admin/content/[videoId]/review-status/route.ts"],
  ["admin/content/topic-library-status", "src/app/api/admin/content/topic-library-status/route.ts"],
  ["admin/content-analysis", "src/app/api/admin/content-analysis/route.ts"],
  ["admin/execute-tool", "src/app/api/admin/execute-tool/route.ts"],
  ["admin/member-ai-suggestion", "src/app/api/admin/member-ai-suggestion/route.ts"],
  ["admin/system/settings", "src/app/api/admin/system/settings/route.ts"],
  ["admin/video-assets/[videoId]", "src/app/api/admin/video-assets/[videoId]/route.ts"],
  ["admin/videos/[videoId]/lifecycle", "src/app/api/admin/videos/[videoId]/lifecycle/route.ts"],
  ["dashboard/sample-quality-check", "src/app/api/dashboard/sample-quality-check/route.ts"],
] as const;

const sampleRoutes = [
  ["admin/fulfillment/mark", "src/app/api/admin/fulfillment/mark/route.ts"],
  ["admin/fulfillment/appeal/handle", "src/app/api/admin/fulfillment/appeal/handle/route.ts"],
] as const;

for (const [route, relativePath] of [...routeContracts, ...sampleRoutes]) {
  test(`${route} 写入路由保留统一观测与分层结果契约`, () => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
    assert.match(source, /observeMutation(?:Request)?\s*\(/);
    assert.equal(source.includes(`"/api/${route}"`), true);
    if (routeContracts.some(([candidate]) => candidate === route)) {
      assert.match(source, /businessSucceeded|mutationFields|appendObservedMutationResult/);
    }
  });
}

test("统一结果出口保留业务响应并补齐失败分层", async () => {
  const details: Record<string, unknown>[] = [];
  let finalized = false;
  const response = await appendObservedMutationResult(
    Response.json({ success: false, error: "拒绝" }, { status: 403 }),
    {
      requestId: "00000000-0000-4000-8000-000000000000",
      setDetail: (detail: Record<string, unknown>) => details.push(detail),
      mark: (stage: MutationStage) => {
        if (stage === "finalize") finalized = true;
      },
    } as MutationObservation,
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "拒绝");
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.permissionChecked, false);
  assert.equal(body.auditStatus, "skipped");
  assert.equal(body.employeeNotificationStatus, "skipped");
  assert.equal(body.todoStatus, "skipped");
  assert.equal(body.compensationRequired, false);
  assert.equal(finalized, false);
  assert.equal(details.length, 1);
});
