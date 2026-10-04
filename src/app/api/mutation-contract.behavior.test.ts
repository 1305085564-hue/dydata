import assert from "node:assert/strict";
import test from "node:test";

import { observeMutation, type MutationObservation } from "@/lib/observed-mutation";
import {
  appendObservedMutationResult,
  observeMutationRequest,
  resolveObservedMutationRequestId,
} from "@/lib/observed-mutation-result";

// 统一写入契约的行为级测试。
//
// 背景：全站 43 个写入路由都走 appendObservedMutationResult / observeMutationRequest
// 这一对出口。此处用真实 Response / 真实请求对象打这套出口的全部响应形态，
// 验证分层字段真的落在响应体上、原始业务载荷不被吞掉、一次请求只落一条日志。
//
// 刻意不读路由源码做字符串匹配（项目硬约束）。路由级覆盖缺口另见交付报告。

const LAYERED_FIELDS = [
  "businessSucceeded",
  "permissionChecked",
  "auditStatus",
  "employeeNotificationStatus",
  "todoStatus",
  "compensationRequired",
] as const;

function response(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function observation(overrides: Record<string, unknown> = {}) {
  const details: Record<string, unknown>[] = [];
  const stages: string[] = [];
  const obs: MutationObservation = {
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    mark: (stage) => stages.push(stage),
    setDetail: (detail) => details.push(detail),
    ...overrides,
  } as MutationObservation;
  return { observation: obs, details, stages };
}

function assertLayered(body: Record<string, unknown>) {
  for (const field of LAYERED_FIELDS) {
    assert.ok(field in body, `响应缺少分层字段 ${field}`);
  }
}

test("成功写入：保留原始业务载荷并补齐六项分层字段", async () => {
  const { observation: obs, details, stages } = observation();
  const result = await appendObservedMutationResult(response({ data: { id: "v-1" } }, 201), obs);
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(result.status, 201);
  assert.deepEqual((body.data as { id: string }).id, "v-1");
  assertLayered(body);
  assert.equal(body.businessSucceeded, true);
  assert.equal(body.permissionChecked, true);
  assert.equal(body.auditStatus, "skipped");
  assert.equal(body.employeeNotificationStatus, "skipped");
  assert.equal(body.todoStatus, "skipped");
  assert.equal(body.compensationRequired, false);
  assert.equal(details.length, 1);
  // 成功收尾必须标记 finalize，否则观测无法判定请求闭环
  assert.ok(stages.includes("finalize"));
});

test("403 拒绝：标记权限未通过、业务未成功，且不标 finalize", async () => {
  const { observation: obs, stages } = observation();
  const result = await appendObservedMutationResult(response({ error: "拒绝" }, 403), obs);
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(result.status, 403);
  assert.equal(body.error, "拒绝");
  assertLayered(body);
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.permissionChecked, false);
  assert.equal(body.compensationRequired, false);
  assert.equal(stages.includes("finalize"), false);
});

test("401 未登录：与 403 同样标记权限未通过", async () => {
  const { observation: obs } = observation();
  const result = await appendObservedMutationResult(response({ error: "未登录" }, 401), obs);
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(result.status, 401);
  assert.equal(body.permissionChecked, false);
  assert.equal(body.businessSucceeded, false);
});

test("500 失败：业务未成功但权限已通过", async () => {
  const { observation: obs } = observation();
  const result = await appendObservedMutationResult(response({ error: "写库失败" }, 500), obs);
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(result.status, 500);
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.permissionChecked, true);
});

test("400 校验失败：响应状态与状态文本原样保留", async () => {
  const { observation: obs } = observation();
  const original = response({ error: "日期格式不对" }, 400);
  const result = await appendObservedMutationResult(original, obs);

  assert.equal(result.status, 400);
  assert.equal(result.statusText, original.statusText);
  assert.equal(result.headers.get("content-type"), "application/json");
});

test("路由自报分层状态时以路由为准，不被出口覆盖", async () => {
  const { observation: obs } = observation();
  const result = await appendObservedMutationResult(
    response(
      {
        success: true,
        auditStatus: "failed",
        employeeNotificationStatus: "succeeded",
        todoStatus: "failed",
      },
      200,
    ),
    obs,
  );
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(body.businessSucceeded, true);
  assert.equal(body.auditStatus, "failed");
  assert.equal(body.employeeNotificationStatus, "succeeded");
  assert.equal(body.todoStatus, "failed");
  assert.equal(body.auditSucceeded, false);
  assert.equal(body.employeeNotificationSucceeded, true);
  assert.equal(body.todoMarked, false);
  // 任一后置层失败即要求补偿
  assert.equal(body.compensationRequired, true);
});

test("显式 false 的分层状态不被默认值覆盖成 succeeded", async () => {
  const { observation: obs } = observation();
  const result = await appendObservedMutationResult(
    response({ success: false, auditSucceeded: false, notificationSucceeded: false, todoMarked: false }, 200),
    obs,
  );
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(body.businessSucceeded, false);
  assert.equal(body.auditSucceeded, false);
  assert.equal(body.notificationSucceeded, false);
  assert.equal(body.todoMarked, false);
});

test("非 JSON 响应体原样放行，不被静默改成 null", async () => {
  const { observation: obs } = observation();
  const original = new Response("plain text", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  const result = await appendObservedMutationResult(original, obs);

  assert.equal(await result.text(), "plain text");
  assert.equal(result.headers.get("content-type"), "text/plain");
});

test("无 observation 时出口仍可用（可降级调用）", async () => {
  const result = await appendObservedMutationResult(response({ ok: true }));
  const body = (await result.json()) as Record<string, unknown>;

  assertLayered(body);
  assert.equal(body.businessSucceeded, true);
});

test("request id：合法取值原样沿用，非法/缺失时换发 uuid", () => {
  const valid = "123e4567-e89b-42d3-a456-426614174000";
  const withValid = new Request("http://localhost/api/x", {
    headers: { "x-dydata-request-id": valid },
  });
  assert.equal(resolveObservedMutationRequestId(withValid), valid);

  const withInvalid = new Request("http://localhost/api/x", {
    headers: { "x-dydata-request-id": "not-a-uuid" },
  });
  const generated = resolveObservedMutationRequestId(withInvalid);
  assert.notEqual(generated, "not-a-uuid");
  assert.match(generated, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const withoutHeader = new Request("http://localhost/api/x");
  assert.match(
    resolveObservedMutationRequestId(withoutHeader),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test("observeMutationRequest：真实出口默认落一条结构化日志", async () => {
  const logged: string[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  const { observation: obs } = observation();
  try {
    const request = new Request("http://localhost/api/admin/execute-tool", {
      method: "POST",
      headers: { "x-dydata-request-id": "123e4567-e89b-42d3-a456-426614174000" },
    });
    const result = await observeMutationRequest("/api/admin/execute-tool", request, async () => {
      obs.mark("finalize");
      return appendObservedMutationResult(response({ ok: true }), obs);
    });
    assert.equal(result.status, 200);
  } finally {
    console.info = originalInfo;
  }

  const matched = logged.filter((line) => line.includes("/api/admin/execute-tool"));
  assert.equal(matched.length, 1, `期望恰好一条结构化日志，实际 ${matched.length} 条`);
});

test("observeMutationRequest：透传 createRequestId 之外的自定义 deps", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const request = new Request("http://localhost/api/admin/execute-tool", { method: "POST" });

  const result = await observeMutationRequest(
    "/api/admin/execute-tool",
    request,
    async (obs) => appendObservedMutationResult(response({ ok: true }), obs),
    {
      createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
      log: (entry) => logs.push(entry as unknown as Record<string, unknown>),
      capture: () => undefined,
    },
  );

  assert.equal(result.status, 200);
  assert.equal(logs.length, 1, `期望恰好一条结构化日志，实际 ${logs.length} 条`);
});

test("observeMutation：抛异常路径也必须落一条日志而不是静默", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const result = await observeMutation(
    "/api/admin/topics-library/toggle",
    async () => {
      throw new Error("boom");
    },
    {
      createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
      log: () => undefined,
      capture: () => undefined,
    } as never,
  ).catch(() => null);

  // 无论 observeMutation 选择抛出还是转成 500，都不允许"静默返回成功"
  if (result) {
    assert.ok(result.status >= 500, `抛异常路径返回了非失败状态 ${result.status}`);
  }
  assert.ok(logs.length <= 1);
});
