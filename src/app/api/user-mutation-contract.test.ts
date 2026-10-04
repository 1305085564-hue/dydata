import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { appendObservedMutationResult } from "@/lib/observed-mutation-result";
import { observeMutation } from "@/lib/observed-mutation";

const routes = [
  "topics/sub-topics",
  "topics/sub-topics/[id]",
  "topics/sub-topics/[id]/claim",
  "topics/sub-topics/[id]/return",
  "topics/sub-topics/[id]/start-scripting",
  "exemptions/permanent",
  "exemptions/reopen",
  "notifications/[id]/done",
  "notifications/[id]/read",
  "group-mode/enter",
  "group-mode/exit",
  "video-submit",
  "ocr-screenshot",
  "submission-screenshots",
  "usage-events",
] as const;

const routeFiles = [
  "src/app/api/topics/sub-topics/route.ts",
  "src/app/api/topics/sub-topics/[id]/route.ts",
  "src/app/api/topics/sub-topics/[id]/claim/route.ts",
  "src/app/api/topics/sub-topics/[id]/return/route.ts",
  "src/app/api/topics/sub-topics/[id]/start-scripting/route.ts",
  "src/app/api/exemptions/permanent/route.ts",
  "src/app/api/exemptions/reopen/route.ts",
  "src/app/api/notifications/[id]/done/route.ts",
  "src/app/api/notifications/[id]/read/route.ts",
  "src/app/api/group-mode/enter/route.ts",
  "src/app/api/group-mode/exit/route.ts",
  "src/app/api/video-submit/route.ts",
  "src/app/api/ocr-screenshot/route.ts",
  "src/app/api/submission-screenshots/route.ts",
  "src/app/api/usage-events/route.ts",
] as const;

routes.forEach((route, index) => {
  test(`${route} 写入路由接入统一分层结果出口`, () => {
    const source = readFileSync(resolve(process.cwd(), routeFiles[index]), "utf8");
    assert.match(source, /observeMutationRequest\s*\(/);
    assert.match(source, /appendObservedMutationResult\s*\(/);
    assert.equal(source.includes(`"/api/${route}"`), true);
  });
});

test("用户端统一出口保留业务响应并记录拒绝分层", async () => {
  const details: Record<string, unknown>[] = [];
  const response = await appendObservedMutationResult(
    Response.json({ error: "拒绝" }, { status: 403 }),
    {
      requestId: "00000000-0000-4000-8000-000000000000",
      mark: () => undefined,
      setDetail: detail => details.push(detail),
    },
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
  assert.equal(details.length, 1);
});

test("用户端成功写入只产生一条结构化观测并标记完成", async () => {
  const logs: unknown[] = [];
  const response = await observeMutation(
    "/api/usage-events",
    async observation => {
      observation.mark("write-request");
      return appendObservedMutationResult(Response.json({ ok: true }), observation);
    },
    {
      createRequestId: () => "00000000-0000-4000-8000-000000000001",
      log: entry => logs.push(entry),
      capture: () => undefined,
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.businessSucceeded, true);
  assert.equal(body.permissionChecked, true);
  assert.equal(logs.length, 1);
});
