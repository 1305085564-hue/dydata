import assert from "node:assert/strict";
import test from "node:test";

import { observeMutation, type MutationCaptureContext } from "./observed-mutation";
import type { ApiLogEntry } from "./api-logger";

const route = "/api/exemptions/apply" as const;

function deps(logs: ApiLogEntry[] = [], captures: MutationCaptureContext[] = []) {
  let now = 1_000;
  return {
    createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
    now: () => {
      now += 25;
      return now;
    },
    release: () => "release-1",
    log: (entry: ApiLogEntry) => logs.push(entry),
    capture: (_error: Error, context: MutationCaptureContext) => captures.push(context),
  };
}

test("observeMutation 保留响应状态、正文和 Cookie，只追加服务器诊断头", async () => {
  const logs: ApiLogEntry[] = [];
  const response = await observeMutation(route, async (observation) => {
    observation.mark("auth");
    observation.mark("write-request");
    return new Response(JSON.stringify({ data: [{ id: "row-1" }] }), {
      status: 201,
      headers: {
        "content-type": "application/json",
        "set-cookie": "sid=abc; HttpOnly",
      },
    });
  }, deps(logs));

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-dydata-request-id"), "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(response.headers.get("set-cookie"), "sid=abc; HttpOnly");
  assert.deepEqual(await response.json(), { data: [{ id: "row-1" }] });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, "success");
  assert.deepEqual(logs[0]?.detail?.stages, ["auth", "write-request"]);
});

test("observeMutation 把 4xx 记为 rejected 且不捕获 Sentry", async () => {
  const logs: ApiLogEntry[] = [];
  const captures: MutationCaptureContext[] = [];
  const response = await observeMutation(route, async (observation) => {
    observation.mark("validate");
    return Response.json({ error: "bad" }, { status: 400 });
  }, deps(logs, captures));

  assert.equal(response.status, 400);
  assert.equal(logs[0]?.outcome, "rejected");
  assert.equal(captures.length, 0);
});

test("observeMutation 对 5xx 记录失败并只捕获固定上下文", async () => {
  const logs: ApiLogEntry[] = [];
  const captures: MutationCaptureContext[] = [];
  const response = await observeMutation("/api/video-submit", async (observation) => {
    observation.mark("write-report");
    observation.mark("compensate");
    return Response.json({ error: "db raw error stays in response" }, { status: 500 });
  }, deps(logs, captures));

  assert.equal(response.status, 500);
  assert.equal(logs[0]?.outcome, "failed");
  assert.equal(logs[0]?.detail?.primaryStage, "write-report");
  assert.equal(logs[0]?.detail?.stage, "compensate");
  assert.equal(logs[0]?.detail?.compensationOccurred, true);
  assert.deepEqual(captures, [{
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    route: "/api/video-submit",
    stage: "write-report",
    outcome: "failed",
  }]);
});

test("observeMutation 原样抛出异常并记录 thrown", async () => {
  const logs: ApiLogEntry[] = [];
  const boom = new Error("private database detail");

  await assert.rejects(
    observeMutation("/api/exemptions/review", async (observation) => {
      observation.mark("review-rpc");
      throw boom;
    }, deps(logs)),
    boom,
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, "thrown");
  assert.equal(logs[0]?.detail?.stage, "review-rpc");
  assert.equal(JSON.stringify(logs[0]), JSON.stringify(logs[0]).replace("private database detail", ""));
});

test("observeMutation 的日志和捕获失败不影响业务响应", async () => {
  const response = await observeMutation(route, async (observation) => {
    observation.mark("write-dates");
    return Response.json({ error: "failed" }, { status: 500 });
  }, {
    createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
    log: () => { throw new Error("log down"); },
    capture: () => { throw new Error("sentry down"); },
  });

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-dydata-request-id"), "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(await response.json(), { error: "failed" });
});

test("observeMutation 为并发请求隔离 requestId 和阶段", async () => {
  const logs: ApiLogEntry[] = [];
  let next = 1;
  const baseDeps = {
    createRequestId: () => `123e4567-e89b-42d3-a456-42661417400${next++}`,
    log: (entry: ApiLogEntry) => logs.push(entry),
  };

  const [first, second] = await Promise.all([
    observeMutation(route, async (observation) => {
      observation.mark("auth");
      return Response.json({ ok: true });
    }, baseDeps),
    observeMutation(route, async (observation) => {
      observation.mark("validate");
      return Response.json({ ok: true });
    }, baseDeps),
  ]);

  assert.notEqual(first.headers.get("x-dydata-request-id"), second.headers.get("x-dydata-request-id"));
  assert.deepEqual(logs.map((entry) => entry.detail?.stages), [["auth"], ["validate"]]);
});
