import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import {
  buildHandleFulfillmentAppealResponse,
  buildFulfillmentAppealRejectionAuditDetail,
  buildFulfillmentAppealRejectionNotification,
  isAlreadyHandledAppealError,
  parseHandleFulfillmentAppealPayload,
  type HandleFulfillmentAppealDeps,
} from "./route";
import { observeMutation, type MutationCaptureContext } from "@/lib/observed-mutation";
import type { ApiLogEntry } from "@/lib/api-logger";

const APPEAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOTIFICATION_ID = "123e4567-e89b-42d3-a456-426614174001";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174002";
const OWNER_ID = "123e4567-e89b-42d3-a456-426614174003";

type TestAuth = Parameters<HandleFulfillmentAppealDeps["requireOwnerOrAdminRole"]>[0];

function makeDeps(overrides: Partial<HandleFulfillmentAppealDeps> = {}) {
  const auth = {
    supabase: {},
    actor: { userId: ACTOR_ID },
    permissionInfo: {},
    scope: { kind: "team", visibleUserIds: [OWNER_ID], activeVisibleUserIds: [OWNER_ID] },
  } as unknown as TestAuth;
  const deps: HandleFulfillmentAppealDeps = {
    requireAdminServiceClient: async () => auth,
    requireOwnerOrAdminRole: () => null,
    requireActiveVisibleUsers: () => null,
    loadAppealOwner: async () => ({
      data: { user_id: OWNER_ID, account_id: null, record_date: "2026-10-01" },
      error: null,
    }),
    handleAppealRpc: async (_auth, input) => ({
      data: { status: input.decision === "approve" ? "approved" : "rejected" },
      error: null,
    }),
    emit: async () => ({ ok: true, inserted: 1 }),
    markDone: async () => true,
    markAppealTodosDone: async () => ({ count: 0 }),
    withRetry: async <T>(task: (attempt: number) => Promise<T>) => task(1),
    withTimeout: async <T>(task: (signal: AbortSignal) => Promise<T>) => task(new AbortController().signal),
    ...overrides,
  };
  return deps;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("handle fulfillment appeal payload 校验 uuid 和 decision", () => {
  const invalidId = parseHandleFulfillmentAppealPayload({ appealId: "bad", decision: "approve" });
  assert.equal("response" in invalidId && invalidId.response.status, 400);

  const invalidDecision = parseHandleFulfillmentAppealPayload({ appealId: APPEAL_ID, decision: "pass" });
  assert.equal("response" in invalidDecision && invalidDecision.response.status, 400);

  const valid = parseHandleFulfillmentAppealPayload({ appealId: APPEAL_ID, decision: "reject" });
  assert.equal("response" in valid && valid.response.status, 400);

  const validWithReason = parseHandleFulfillmentAppealPayload({
    appealId: APPEAL_ID,
    decision: "reject",
    reason: "发布时间截图与平台记录不一致",
  });
  assert.deepEqual("data" in validWithReason && validWithReason.data, {
    appealId: APPEAL_ID,
    decision: "reject",
    reason: "发布时间截图与平台记录不一致",
  });
});

test("同意补交不要求驳回原因，原因长度受限", () => {
  const approved = parseHandleFulfillmentAppealPayload({
    appealId: APPEAL_ID,
    decision: "approve",
  });
  assert.deepEqual("data" in approved && approved.data, {
    appealId: APPEAL_ID,
    decision: "approve",
  });

  const tooLong = parseHandleFulfillmentAppealPayload({
    appealId: APPEAL_ID,
    decision: "reject",
    reason: "x".repeat(1001),
  });
  assert.equal("response" in tooLong && tooLong.response.status, 400);
});

test("驳回原因只进入通知和审计详情，不进入补交单 payload", () => {
  const reason = "请核对平台真实发布时间后再提交";
  assert.equal(
    buildFulfillmentAppealRejectionNotification("2026-10-01", reason),
    "2026-10-01 的数据补交申请已被驳回。驳回原因：请核对平台真实发布时间后再提交",
  );
  assert.deepEqual(
    JSON.parse(
      buildFulfillmentAppealRejectionAuditDetail({
        appealId: APPEAL_ID,
        accountId: "account-1",
        recordDate: "2026-10-01",
        reason,
      }),
    ),
    {
      appealId: APPEAL_ID,
      accountId: "account-1",
      recordDate: "2026-10-01",
      decision: "rejected",
      reason,
    },
  );
});

test("审批成功时用分层结果契约并完成同一条待办", async () => {
  let markedId = "";
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve", notificationId: NOTIFICATION_ID },
    makeDeps({ markDone: async (notificationId) => { markedId = notificationId; return true; } }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    ok: true,
    status: "approved",
    notificationMarked: true,
    businessSucceeded: true,
    auditSucceeded: true,
    employeeNotificationSucceeded: true,
    auditStatus: "succeeded",
    employeeNotificationStatus: "succeeded",
    todoStatus: "succeeded",
  });
  assert.equal(markedId, NOTIFICATION_ID);
});

test("审批申请只读依赖失败时按有限次数重试，写入不在重试范围", async () => {
  let reads = 0;
  let rpcCalls = 0;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({
      loadAppealOwner: async () => {
        reads += 1;
        if (reads === 1) return { data: null, error: new Error("transient read failure") };
        return { data: { user_id: OWNER_ID, account_id: null, record_date: "2026-10-01" }, error: null };
      },
      handleAppealRpc: async () => {
        rpcCalls += 1;
        return { data: { status: "approved" }, error: null };
      },
      withRetry: async <T>(task: (attempt: number) => Promise<T>) => {
        try {
          return await task(1);
        } catch {
          return task(2);
        }
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(reads, 2);
  assert.equal(rpcCalls, 1);
});

test("待办标记失败不反转已成功审批", async () => {
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve", notificationId: NOTIFICATION_ID },
    makeDeps({ markDone: async () => false }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    ok: true,
    status: "approved",
    notificationMarked: false,
    businessSucceeded: true,
    auditSucceeded: true,
    employeeNotificationSucceeded: true,
    auditStatus: "succeeded",
    employeeNotificationStatus: "succeeded",
    todoStatus: "failed",
  });
});

test("already handled 是幂等成功，不重复审计或员工通知", async () => {
  let notifications = 0;
  let marked = 0;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "reject", reason: "重复提交", notificationId: NOTIFICATION_ID },
    makeDeps({
      handleAppealRpc: async () => ({ data: null, error: new Error("appeal already handled") }),
      emit: async () => { notifications += 1; return { ok: true, inserted: 1 }; },
      markDone: async () => { marked += 1; return true; },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    ok: true,
    status: "already_handled",
    notificationMarked: true,
    businessSucceeded: true,
    auditSucceeded: null,
    employeeNotificationSucceeded: null,
    auditStatus: "skipped",
    employeeNotificationStatus: "skipped",
    todoStatus: "succeeded",
  });
  assert.equal(notifications, 0);
  assert.equal(marked, 1);
});

test("申请不存在和越权时不执行审批或后置动作", async () => {
  let rpcCalls = 0;
  const notFound = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({ loadAppealOwner: async () => ({ data: null, error: null }), handleAppealRpc: async () => { rpcCalls += 1; return { data: null, error: null }; } }),
  );
  assert.equal(notFound.status, 404);
  assert.equal((await readJson(notFound)).code, "APPEAL_NOT_FOUND");

  const forbidden = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({ requireActiveVisibleUsers: () => NextResponse.json({ error: "无权限" }, { status: 403 }), handleAppealRpc: async () => { rpcCalls += 1; return { data: null, error: null }; } }),
  );
  assert.equal(forbidden.status, 403);
  assert.equal((await readJson(forbidden)).code, "APPEAL_OUT_OF_SCOPE");
  assert.equal(rpcCalls, 0);
});

test("RPC、审计、员工通知失败分别保留业务分层", async () => {
  const rpcFailed = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({ handleAppealRpc: async () => ({ data: null, error: new Error("private sql detail") }) }),
  );
  assert.equal(rpcFailed.status, 500);
  assert.deepEqual(await readJson(rpcFailed), {
    ok: false,
    code: "RPC_FAILED",
    error: "补交申请处理失败，请稍后重试",
    businessSucceeded: false,
    notificationMarked: null,
    auditSucceeded: null,
    employeeNotificationSucceeded: null,
    auditStatus: "skipped",
    employeeNotificationStatus: "skipped",
    todoStatus: "skipped",
  });

  let emits = 0;
  const auditFailed = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "reject", reason: "证据不足", notificationId: NOTIFICATION_ID },
    makeDeps({
      handleAppealRpc: async () => ({ data: null, error: new Error("audit insert failed") }),
      emit: async () => { emits += 1; return { ok: true, inserted: 1 }; },
    }),
  );
  assert.equal(auditFailed.status, 500);
  const auditPayload = await readJson(auditFailed);
  assert.equal(auditPayload.businessSucceeded, false);
  assert.equal(auditPayload.auditStatus, "failed");
  assert.equal(emits, 0);

  const notificationFailed = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve", notificationId: NOTIFICATION_ID },
    makeDeps({ emit: async () => ({ ok: false, inserted: 0, error: "private notification detail" }) }),
  );
  assert.equal(notificationFailed.status, 500);
  const notificationPayload = await readJson(notificationFailed);
  assert.equal(notificationPayload.businessSucceeded, true);
  assert.equal(notificationPayload.employeeNotificationStatus, "failed");
});

test("未传 notificationId 时审批成功但待办跳过且 markDone 零调用", async () => {
  let marked = 0;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({ markDone: async () => { marked += 1; return true; } }),
  );
  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.notificationMarked, null);
  assert.equal(body.todoStatus, "skipped");
  assert.equal(marked, 0);
});

test("未传 notificationId 时按 appealId 关闭同源全部待办并记录数量", async () => {
  let markDoneCalls = 0;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({
      markDone: async () => { markDoneCalls += 1; return true; },
      markAppealTodosDone: async () => ({ count: 9 }),
    }),
  );
  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.notificationMarked, true);
  assert.equal(body.todoStatus, "succeeded");
  assert.equal(markDoneCalls, 0);
});

test("按 appealId 查不到待办时保持 skipped，不谎报成功", async () => {
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({ markAppealTodosDone: async () => ({ count: 0 }) }),
  );
  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.notificationMarked, null);
  assert.equal(body.todoStatus, "skipped");
});

test("同源待办批量关闭失败时返回 failed，不谎报 succeeded", async () => {
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makeDeps({ markAppealTodosDone: async () => ({ count: 0, error: new Error("update failed") }) }),
  );
  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.notificationMarked, false);
  assert.equal(body.todoStatus, "failed");
});

test("rejected 的单条审计由 RPC 写入，路由不再追加第二条", async () => {
  let auditWrites = 0;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "reject", reason: "证据不足" },
    makeDeps({ handleAppealRpc: async () => { auditWrites += 1; return { data: { status: "rejected" }, error: null }; } }),
  );
  assert.equal(response.status, 200);
  assert.equal(auditWrites, 1);
  assert.equal((await readJson(response)).auditStatus, "succeeded");
});

test("同一 requestId 只由 observeMutation 落一条结构化审批观测记录", async () => {
  const logs: ApiLogEntry[] = [];
  const response = await observeMutation("/api/admin/fulfillment/appeal/handle", async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({
      actor: "authenticated-admin",
      appealId: APPEAL_ID,
      decision: "approve",
      notificationId: null,
      businessStatus: "approved",
      businessSucceeded: true,
      auditStatus: "succeeded",
      employeeNotificationStatus: "succeeded",
      todoStatus: "skipped",
      compensationRequired: false,
      events: ["fulfillment_appeal.business_succeeded"],
    });
    return Response.json({ status: "approved", businessSucceeded: true });
  }, {
    createRequestId: () => APPEAL_ID,
    log: (entry: ApiLogEntry) => logs.push(entry),
  });
  assert.equal(response.headers.get("x-dydata-request-id"), APPEAL_ID);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.requestId, APPEAL_ID);
  assert.equal(logs[0]?.detail?.outcome, "success");
  assert.deepEqual(logs[0]?.detail?.events, ["fulfillment_appeal.business_succeeded"]);
});

test("审批依赖抛异常仍由 observeMutation 留下一条 thrown 记录", async () => {
  const logs: ApiLogEntry[] = [];
  const captures: MutationCaptureContext[] = [];
  const dependencyError = new Error("private dependency detail");

  await assert.rejects(
    observeMutation("/api/admin/fulfillment/appeal/handle", (observation) =>
      buildHandleFulfillmentAppealResponse(
        { appealId: APPEAL_ID, decision: "approve" },
        makeDeps({ handleAppealRpc: async () => { throw dependencyError; } }),
        observation,
      ),
    {
      createRequestId: () => APPEAL_ID,
      log: (entry: ApiLogEntry) => logs.push(entry),
      capture: (_error: Error, context: MutationCaptureContext) => captures.push(context),
    }),
    dependencyError,
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.requestId, APPEAL_ID);
  assert.equal(logs[0]?.detail?.outcome, "thrown");
  assert.deepEqual(logs[0]?.detail?.stages, ["validate", "auth", "read", "scope", "review-rpc"]);
  assert.equal(JSON.stringify(logs[0]).includes("private dependency detail"), false);
  assert.deepEqual(captures, [{
    requestId: APPEAL_ID,
    route: "/api/admin/fulfillment/appeal/handle",
    stage: "review-rpc",
    outcome: "thrown",
  }]);
});

test("幂等错误只接受精确文案并递归识别包装错误", () => {
  assert.equal(isAlreadyHandledAppealError(new Error("appeal already handled")), true);
  assert.equal(isAlreadyHandledAppealError({ error: { message: "appeal already handled" } }), true);
  assert.equal(isAlreadyHandledAppealError(new Error("appeal already handled: extra")), false);
  assert.equal(isAlreadyHandledAppealError(new Error("appeal not found")), false);
  assert.equal(isAlreadyHandledAppealError(null), false);
});
