import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { observeMutation, type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult } from "@/lib/observed-mutation-result";
import {
  buildVideoSubmitResponse,
  defaultVideoSubmitDeps,
  type VideoSubmitDeps,
} from "./route-core";

function makeRequest() {
  return new NextRequest("http://localhost/api/video-submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

function observe(handler: (observation: MutationObservation) => Promise<Response>) {
  const logs: Array<Record<string, unknown>> = [];
  return {
    logs,
    response: observeMutation(
      "/api/video-submit",
      (observation) => handler(observation).then(response => appendObservedMutationResult(response, observation)),
      {
        createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
        release: () => "test-release",
        log: (entry) => logs.push(entry as unknown as Record<string, unknown>),
      },
    ),
  };
}

test("video-submit 未登录时明确失败并补齐契约分层字段，且只记录一条观测", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as Awaited<ReturnType<typeof defaultVideoSubmitDeps.createClient>>),
  };
  const { response, logs } = observe((observation) =>
    buildVideoSubmitResponse(makeRequest(), deps, observation),
  );

  const result = await response;
  assert.equal(result.status, 401);
  assert.equal(result.headers.get("x-dydata-request-id"), "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(await result.json(), {
    error: "未登录",
    businessSucceeded: false,
    permissionChecked: false,
    auditSucceeded: null,
    notificationSucceeded: null,
    todoMarked: null,
    compensationRequired: false,
    auditStatus: "skipped",
    employeeNotificationStatus: "skipped",
    todoStatus: "skipped",
    employeeNotificationSucceeded: null,
    notificationMarked: null,
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, "rejected");
});

test("video-submit 鉴权依赖抛错时不静默成功且只记录一条 thrown 观测", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => {
      throw new Error("auth dependency failed");
    },
  };
  const { response, logs } = observe((observation) =>
    buildVideoSubmitResponse(makeRequest(), deps, observation),
  );

  await assert.rejects(response, /auth dependency failed/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, "thrown");
  const detail = logs[0]?.detail as Record<string, unknown>;
  assert.equal(detail.primaryStage, "auth");
  assert.deepEqual(detail.stages, ["auth"]);
});
