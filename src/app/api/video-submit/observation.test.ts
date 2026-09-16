import assert from "node:assert/strict";
import test from "node:test";

import { observeMutation, type MutationCaptureContext } from "@/lib/observed-mutation";
import type { ApiLogEntry } from "@/lib/api-logger";

test("video-submit 观测适配层透传原响应 JSON 和状态", async () => {
  const logs: ApiLogEntry[] = [];
  const response = await observeMutation("/api/video-submit", async (observation) => {
    observation.mark("auth");
    observation.mark("validate");
    observation.mark("finalize");
    return Response.json({ ok: true, video_id: "video-1", ai_tags: [] }, { status: 200 });
  }, {
    createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
    release: () => "sha-1",
    log: (entry) => logs.push(entry),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-dydata-request-id"), "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(await response.json(), { ok: true, video_id: "video-1", ai_tags: [] });
  assert.equal(logs[0]?.route, "/api/video-submit");
  assert.equal(logs[0]?.detail?.release, "sha-1");
});

test("video-submit 失败后补偿阶段不覆盖主失败阶段", async () => {
  const logs: ApiLogEntry[] = [];
  const captures: MutationCaptureContext[] = [];
  const response = await observeMutation("/api/video-submit", async (observation) => {
    observation.mark("write-report");
    observation.mark("compensate");
    return Response.json({ error: "日报记录创建失败" }, { status: 500 });
  }, {
    createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
    log: (entry) => logs.push(entry),
    capture: (_error, context) => captures.push(context),
  });

  assert.equal(response.status, 500);
  assert.equal(logs[0]?.detail?.stage, "compensate");
  assert.equal(logs[0]?.detail?.primaryStage, "write-report");
  assert.deepEqual(captures[0], {
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    route: "/api/video-submit",
    stage: "write-report",
    outcome: "failed",
  });
});
