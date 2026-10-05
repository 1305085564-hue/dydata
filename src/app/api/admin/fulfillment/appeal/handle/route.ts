import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
} from "../../_shared";
import { emit, markDone, type EmitResult } from "@/lib/notifications/server";
import { withRetry } from "@/lib/retry";
import { createOperationResult } from "@/lib/operation-result";
import { createRequestContext } from "@/lib/request-context";
import { withTimeout } from "@/lib/timeout";
import { AppError, normalizeAppError } from "@/lib/errors";
import { observeMutation, type MutationObservation, type MutationStage } from "@/lib/observed-mutation";

export type FulfillmentAppealDecision = "approve" | "reject";
export type FulfillmentAppealStatus = "approved" | "rejected" | "already_handled";
export type FulfillmentAppealSideEffectStatus = "succeeded" | "failed" | "skipped";

export type HandleFulfillmentAppealPayload = {
  appealId: string;
  decision: FulfillmentAppealDecision;
  reason?: string;
  notificationId?: string;
};

type AppealOwner = {
  user_id: string;
  account_id: string | null;
  record_date: string;
};

type RpcResult = { data: unknown; error: unknown };
type AdminAuth = Awaited<ReturnType<typeof requireAdminServiceClient>>;

export type HandleFulfillmentAppealDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
  requireActiveVisibleUsers: typeof requireActiveVisibleUsers;
  loadAppealOwner: (auth: AdminAuth, appealId: string, signal: AbortSignal) => Promise<{
    data: AppealOwner | null;
    error: unknown;
  }>;
  handleAppealRpc: (auth: AdminAuth, payload: HandleFulfillmentAppealPayload) => Promise<RpcResult>;
  emit: typeof emit;
  markDone: typeof markDone;
  markAppealTodosDone: (auth: AdminAuth, appealId: string) => Promise<{ count: number; error?: unknown }>;
  withRetry: typeof withRetry;
  withTimeout: typeof withTimeout;
};

const APPEAL_READ_TIMEOUT_MS = 4_000;

export function buildFulfillmentAppealRejectionNotification(recordDate: string, reason: string) {
  return `${recordDate} 的数据补交申请已被驳回。驳回原因：${reason}`;
}

export function buildFulfillmentAppealRejectionAuditDetail(input: {
  appealId: string;
  accountId: string | null;
  recordDate: string;
  reason: string;
}) {
  return JSON.stringify({
    appealId: input.appealId,
    accountId: input.accountId,
    recordDate: input.recordDate,
    decision: "rejected",
    reason: input.reason,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sideEffectStatus(value: boolean | null | undefined): FulfillmentAppealSideEffectStatus {
  if (value === true) return "succeeded";
  if (value === false) return "failed";
  return "skipped";
}

function setFulfillmentAppealObservationResult(
  observation: MutationObservation | undefined,
  response: Record<string, unknown>,
) {
  observation?.setDetail?.(buildFulfillmentAppealObservationDetail(response));
}

function failureResponse(error: AppError, input: {
  businessSucceeded?: boolean;
  notificationMarked?: boolean | null;
  auditStatus?: FulfillmentAppealSideEffectStatus;
  employeeNotificationStatus?: FulfillmentAppealSideEffectStatus;
  todoStatus?: FulfillmentAppealSideEffectStatus;
} = {}) {
  const normalized = normalizeAppError(error);
  const todoStatus = input.todoStatus ?? sideEffectStatus(input.notificationMarked);
  return NextResponse.json({
    ok: false,
    code: normalized.code,
    error: normalized.publicMessage,
    businessSucceeded: input.businessSucceeded ?? false,
    notificationMarked: input.notificationMarked ?? null,
    auditSucceeded: input.auditStatus === "succeeded" ? true : input.auditStatus === "failed" ? false : null,
    employeeNotificationSucceeded: input.employeeNotificationStatus === "succeeded"
      ? true
      : input.employeeNotificationStatus === "failed"
        ? false
        : null,
    auditStatus: input.auditStatus ?? "skipped",
    employeeNotificationStatus: input.employeeNotificationStatus ?? "skipped",
    todoStatus,
  }, { status: normalized.status });
}

export function parseHandleFulfillmentAppealPayload(
  input: unknown,
): { data: HandleFulfillmentAppealPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "body", publicMessage: "请求体必须是对象" })) };
  }

  const appealId = typeof input.appealId === "string" ? input.appealId.trim() : "";
  if (!UUID_PATTERN.test(appealId)) {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "appealId", publicMessage: "appealId 必须是 uuid" })) };
  }

  const decision = typeof input.decision === "string" ? input.decision.trim() : "";
  if (decision !== "approve" && decision !== "reject") {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "decision", publicMessage: "decision 必须是 approve/reject" })) };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (decision === "reject" && !reason) {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "reason", publicMessage: "驳回时必须填写驳回原因" })) };
  }
  if (reason.length > 1000) {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "reason", publicMessage: "驳回原因不能超过 1000 字" })) };
  }

  if (input.notificationId !== undefined && typeof input.notificationId !== "string") {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "notificationId", publicMessage: "notificationId 必须是 uuid" })) };
  }
  const notificationId = typeof input.notificationId === "string" ? input.notificationId.trim() : "";
  if (notificationId && !UUID_PATTERN.test(notificationId)) {
    return { response: failureResponse(new AppError({ code: "INVALID_INPUT", message: "notificationId", publicMessage: "notificationId 必须是 uuid" })) };
  }

  return {
    data: {
      appealId,
      decision: decision as FulfillmentAppealDecision,
      ...(reason ? { reason } : {}),
      ...(notificationId ? { notificationId } : {}),
    },
  };
}

function errorText(value: unknown): string | null {
  if (value instanceof Error) return value.message.trim() || null;
  if (!isRecord(value)) return null;
  for (const key of ["message", "details", "hint"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  return null;
}

function hasAlreadyHandledMessage(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (errorText(value)?.toLowerCase() === "appeal already handled") return true;
  if (isRecord(value)) return [value.cause, value.error].some((nested) => hasAlreadyHandledMessage(nested, seen));
  return false;
}

export function isAlreadyHandledAppealError(error: unknown) {
  return hasAlreadyHandledMessage(error);
}

function responseCodeForStatus(status: number) {
  if (status === 401) return "UNAUTHENTICATED" as const;
  if (status === 403) return "FORBIDDEN" as const;
  return "INTERNAL_ERROR" as const;
}

function responseFromAuthFailure(response: Response) {
  const code = responseCodeForStatus(response.status);
  const message = code === "UNAUTHENTICATED" ? "请先登录" : code === "FORBIDDEN" ? "无权限执行此操作" : "请求处理失败";
  return failureResponse(new AppError({ code, message, publicMessage: message, status: response.status }));
}

function defaultLoadAppealOwner(auth: AdminAuth, appealId: string, signal: AbortSignal) {
  if ("response" in auth) return Promise.resolve({ data: null, error: auth.response });
  return Promise.resolve(auth.supabase
    .from("fulfillment_appeals")
    .select("user_id, account_id, record_date")
    .eq("id", appealId)
    .abortSignal(signal)
    .maybeSingle())
    .then((result) => ({ data: result.data as AppealOwner | null, error: result.error }));
}

export function defaultHandleAppealRpc(auth: AdminAuth, payload: HandleFulfillmentAppealPayload) {
  if ("response" in auth) return Promise.resolve({ data: null, error: auth.response });
  return Promise.resolve(auth.supabase.rpc("handle_fulfillment_appeal", {
    p_appeal_id: payload.appealId,
    p_decision: payload.decision,
    p_handler_id: auth.actor.userId, p_reason: payload.decision === "reject" ? payload.reason ?? null : null,
  }));
}

const defaultDeps: HandleFulfillmentAppealDeps = {
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
  loadAppealOwner: defaultLoadAppealOwner,
  handleAppealRpc: defaultHandleAppealRpc,
  emit,
  markDone,
  markAppealTodosDone: defaultMarkAppealTodosDone,
  withRetry,
  withTimeout,
};

async function defaultMarkAppealTodosDone(auth: AdminAuth, appealId: string) {
  if ("response" in auth) return { count: 0, error: auth.response };
  try {
    const { data, error } = await auth.supabase
      .from("notifications")
      .update({ status: "done", done_at: new Date().toISOString() })
      .eq("category", "todo")
      .eq("source_type", "fulfillment_appeal")
      .eq("source_id", appealId)
      .in("status", ["unread", "read"])
      .select("id");
    return { count: data?.length ?? 0, error };
  } catch (error) {
    return { count: 0, error };
  }
}

async function tryMarkTodosDone(
  deps: HandleFulfillmentAppealDeps,
  auth: AdminAuth,
  payload: HandleFulfillmentAppealPayload,
): Promise<{ marked: boolean | null; count: number }> {
  let explicitCount = 0;
  if (payload.notificationId) {
    try {
      if ("response" in auth) return { marked: false, count: 0 };
      const marked = await deps.markDone(payload.notificationId, auth.actor.userId);
      if (!marked) return { marked: false, count: 0 };
      explicitCount = 1;
    } catch {
      return { marked: false, count: 0 };
    }
  }
  const result = await deps.markAppealTodosDone(auth, payload.appealId);
  if (result.error) return { marked: false, count: explicitCount };
  if (result.count > 0) return { marked: true, count: explicitCount + result.count };
  if (payload.notificationId) return { marked: true, count: explicitCount };
  return { marked: null, count: 0 };
}

async function tryMarkExplicitTodoDone(
  deps: HandleFulfillmentAppealDeps,
  auth: AdminAuth,
  payload: HandleFulfillmentAppealPayload,
): Promise<{ marked: boolean | null; count: number }> {
  if (!payload.notificationId) return { marked: null, count: 0 };
  try {
    if ("response" in auth) return { marked: false, count: 0 };
    const marked = await deps.markDone(payload.notificationId, auth.actor.userId);
    return { marked, count: marked ? 1 : 0 };
  } catch {
    return { marked: false, count: 0 };
  }
}

export async function buildHandleFulfillmentAppealResponse(
  input: unknown,
  deps: HandleFulfillmentAppealDeps = defaultDeps,
  observation?: MutationObservation,
): Promise<NextResponse> {
  const mark = (stage: MutationStage) => observation?.mark(stage);
  mark("validate");
  const payload = parseHandleFulfillmentAppealPayload(input);
  if ("response" in payload) return payload.response;

  mark("auth");
  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) return responseFromAuthFailure(auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 }));
  if (observation) {
    observation.setDetail?.({
      actorLabel: "authenticated-admin",
      appealId: payload.data.appealId,
      decision: payload.data.decision,
      notificationId: payload.data.notificationId ?? null,
    });
  }
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return responseFromAuthFailure(forbidden);
  const context = createRequestContext({
    requestId: observation?.requestId ?? crypto.randomUUID(),
    actorId: auth.actor.userId,
    route: "/api/admin/fulfillment/appeal/handle",
    operation: "handle_fulfillment_appeal",
    targetId: payload.data.appealId,
  });

  mark("read");
  let appealOwnerResult: { data: AppealOwner | null; error: unknown };
  try {
    appealOwnerResult = await deps.withRetry(
      async (attempt) => {
        const result = await deps.withTimeout(
          (signal) => deps.loadAppealOwner(auth, payload.data.appealId, signal),
          { timeoutMs: APPEAL_READ_TIMEOUT_MS, operation: `load appeal owner attempt ${attempt}` },
        );
        if (result.error) {
          throw new AppError({ code: "DEPENDENCY_FAILED", message: errorText(result.error) ?? "appeal read failed" });
        }
        return result;
      },
      { maxAttempts: 2, baseDelayMs: 25, maxDelayMs: 100, operation: "load fulfillment appeal" },
    );
  } catch {
    return failureResponse(new AppError({ code: "DEPENDENCY_FAILED", message: "appeal read failed" }));
  }
  if (!appealOwnerResult.data) return failureResponse(new AppError({ code: "APPEAL_NOT_FOUND", message: "appeal not found" }));

  mark("scope");
  const scoped = deps.requireActiveVisibleUsers(auth, [appealOwnerResult.data.user_id]);
  if (scoped) return failureResponse(new AppError({ code: "APPEAL_OUT_OF_SCOPE", message: "appeal out of scope" }));

  mark("review-rpc");
  const rpcResult = await deps.handleAppealRpc(auth, payload.data);
  if (rpcResult.error && isAlreadyHandledAppealError(rpcResult.error)) {
    const todo = await tryMarkTodosDone(deps, auth, payload.data);
    const notificationMarked = todo.marked;
    if (notificationMarked === false) mark("compensate");
    mark("finalize");
    const result = createOperationResult({
      context,
      data: { status: "already_handled" as const, notificationMarked },
      businessSucceeded: true,
      permissionChecked: true,
      auditSucceeded: null,
      notificationSucceeded: null,
      todoMarked: notificationMarked,
      compensationRequired: notificationMarked === false,
    });
    setFulfillmentAppealObservationResult(observation, {
      status: result.data?.status,
      businessSucceeded: result.businessSucceeded,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: sideEffectStatus(result.todoMarked),
      todoMarkedCount: todo.count,
    });
    return NextResponse.json({
      ok: true,
      status: result.data?.status,
      notificationMarked: result.todoMarked,
      businessSucceeded: result.businessSucceeded,
      auditSucceeded: result.auditSucceeded,
      employeeNotificationSucceeded: result.notificationSucceeded,
      auditStatus: "skipped" as const,
      employeeNotificationStatus: "skipped" as const,
      todoStatus: sideEffectStatus(result.todoMarked),
    });
  }
  if (rpcResult.error) {
    setFulfillmentAppealObservationResult(observation, {
      businessSucceeded: false,
      auditStatus: /audit/i.test(errorText(rpcResult.error) ?? "") ? "failed" : "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    });
    return failureResponse(new AppError({ code: "RPC_FAILED", message: errorText(rpcResult.error) ?? "rpc failed" }), {
      auditStatus: /audit/i.test(errorText(rpcResult.error) ?? "") ? "failed" : "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      notificationMarked: null,
    });
  }

  const rpcData = isRecord(rpcResult.data) ? rpcResult.data : null;
  const status = rpcData?.status;
  if (status !== "approved" && status !== "rejected") {
    setFulfillmentAppealObservationResult(observation, {
      businessSucceeded: false,
      auditStatus: "failed",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    });
    return failureResponse(new AppError({ code: "RPC_FAILED", message: "rpc returned invalid status" }), {
      auditStatus: "failed",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      notificationMarked: null,
    });
  }

  // The RPC writes the single audit_logs row for both decisions. A successful RPC
  // therefore proves the audit write; the route must not write a second row.
  const auditStatus: FulfillmentAppealSideEffectStatus = "succeeded";
  const notification: EmitResult = await deps.emit({
    recipients: [appealOwnerResult.data.user_id],
    type: "fulfillment.appeal.result",
    category: "feed",
    severity: status === "approved" ? "success" : "warning",
    title: status === "approved" ? "补交申请已通过" : "补交申请已驳回",
    body: status === "approved"
      ? `${appealOwnerResult.data.record_date} 的补交申请已通过，点击“去上传数据”将自动续交刚才填写的数据。`
      : buildFulfillmentAppealRejectionNotification(appealOwnerResult.data.record_date, payload.data.reason ?? ""),
    actionLabel: status === "approved" ? "去上传数据" : null,
    actionUrl: status === "approved" ? `/dashboard?resumeAppeal=${encodeURIComponent(payload.data.appealId)}` : null,
    sourceType: "fulfillment_appeal_result",
    sourceId: payload.data.appealId,
    payload: { appealId: payload.data.appealId, accountId: appealOwnerResult.data.account_id, status, ...(status === "rejected" ? { reason: payload.data.reason ?? "" } : {}) },
  });
  if (!notification.ok) {
    mark("compensate");
    const todo = await tryMarkExplicitTodoDone(deps, auth, payload.data);
    const notificationMarked = todo.marked;
    setFulfillmentAppealObservationResult(observation, {
      status,
      businessSucceeded: true,
      auditStatus,
      employeeNotificationStatus: "failed",
      todoStatus: sideEffectStatus(notificationMarked),
      todoMarkedCount: todo.count,
    });
    return failureResponse(new AppError({ code: "EMPLOYEE_NOTIFICATION_FAILED", message: notification.error ?? "notification failed" }), {
      businessSucceeded: true,
      notificationMarked,
      auditStatus,
      employeeNotificationStatus: "failed",
    });
  }

  const todo = await tryMarkTodosDone(deps, auth, payload.data);
  const notificationMarked = todo.marked;
  if (notificationMarked === false) mark("compensate");
  mark("finalize");
  const result = createOperationResult({
    context,
    data: { status: status as "approved" | "rejected", notificationMarked },
    businessSucceeded: true,
    permissionChecked: true,
    auditSucceeded: true,
    notificationSucceeded: true,
    todoMarked: notificationMarked,
    compensationRequired: notificationMarked === false,
  });
  setFulfillmentAppealObservationResult(observation, {
    status: result.data?.status,
    businessSucceeded: result.businessSucceeded,
    auditStatus,
    employeeNotificationStatus: "succeeded",
    todoStatus: sideEffectStatus(result.todoMarked),
    todoMarkedCount: todo.count,
  });
  return NextResponse.json({
    ok: true,
    status: result.data?.status,
    notificationMarked: result.todoMarked,
    businessSucceeded: result.businessSucceeded,
    auditSucceeded: result.auditSucceeded,
    employeeNotificationSucceeded: result.notificationSucceeded,
    auditStatus,
    employeeNotificationStatus: "succeeded" as const,
    todoStatus: sideEffectStatus(result.todoMarked),
  });
}

function resolveAppealRequestId(request: Request) {
  const supplied = request.headers.get("x-dydata-request-id")?.trim();
  return supplied && UUID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

function eventsForAppealResponse(body: Record<string, unknown>) {
  const events: string[] = [];
  if (body.status === "already_handled") events.push("fulfillment_appeal.already_handled");
  if (body.businessSucceeded === true) events.push("fulfillment_appeal.business_succeeded");
  if (body.auditStatus === "failed") events.push("fulfillment_appeal.audit_failed");
  if (body.employeeNotificationStatus === "failed") events.push("fulfillment_appeal.employee_notification_failed");
  if (body.todoStatus === "failed") events.push("fulfillment_appeal.notification_mark_failed");
  return Array.from(new Set(events));
}

function buildFulfillmentAppealObservationDetail(response: Record<string, unknown>) {
  return {
    businessStatus: response.status ?? null,
    businessSucceeded: response.businessSucceeded ?? false,
    auditStatus: response.auditStatus ?? "skipped",
    employeeNotificationStatus: response.employeeNotificationStatus ?? "skipped",
    todoStatus: response.todoStatus ?? "skipped",
    todoMarkedCount: response.todoMarkedCount ?? 0,
    compensationRequired: response.auditStatus === "failed" || response.employeeNotificationStatus === "failed" || response.todoStatus === "failed",
    events: eventsForAppealResponse(response),
  };
}

export async function POST(request: Request) {
  return observeMutation("/api/admin/fulfillment/appeal/handle", async (observation) => {
    observation.setDetail?.({
      businessStatus: null,
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    const body = await readJsonBody(request);
    const response = "response" in body
      ? body.response ?? failureResponse(new AppError({ code: "INVALID_INPUT", message: "body" }))
      : await buildHandleFulfillmentAppealResponse(body.data, defaultDeps, observation);
    return response;
  }, {
    createRequestId: () => resolveAppealRequestId(request),
  });
}
