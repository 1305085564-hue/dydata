import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
} from "../../_shared";
import { emit, markDone, type EmitResult } from "@/lib/notifications/server";
import { writeAuditLog, type AuditLogWriteResult } from "@/lib/audit-log";
import { createOperationResult } from "@/lib/operation-result";
import { withRetry } from "@/lib/retry";
import { withTimeout } from "@/lib/timeout";
import { AppError, normalizeAppError } from "@/lib/errors";
import { createRequestContext, type RequestContext } from "@/lib/request-context";
import { logApiRequest } from "@/lib/api-logger";
import { observeMutation, type MutationObservation, type MutationStage } from "@/lib/observed-mutation";

export type FulfillmentAppealDecision = "approve" | "reject";
export type FulfillmentAppealStatus = "approved" | "rejected" | "already_handled";

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
  writeAuditLog: typeof writeAuditLog;
  emit: typeof emit;
  markDone: typeof markDone;
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

function failureResponse(error: AppError, input: {
  businessSucceeded?: boolean;
  notificationMarked?: boolean;
  auditSucceeded?: boolean;
  employeeNotificationSucceeded?: boolean;
} = {}) {
  const normalized = normalizeAppError(error);
  return NextResponse.json({
    ok: false,
    code: normalized.code,
    error: normalized.publicMessage,
    businessSucceeded: input.businessSucceeded ?? false,
    notificationMarked: input.notificationMarked ?? false,
    ...(input.auditSucceeded !== undefined ? { auditSucceeded: input.auditSucceeded } : {}),
    ...(input.employeeNotificationSucceeded !== undefined
      ? { employeeNotificationSucceeded: input.employeeNotificationSucceeded }
      : {}),
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

function defaultHandleAppealRpc(auth: AdminAuth, payload: HandleFulfillmentAppealPayload) {
  if ("response" in auth) return Promise.resolve({ data: null, error: auth.response });
  return Promise.resolve(auth.supabase.rpc("handle_fulfillment_appeal", {
    p_appeal_id: payload.appealId,
    p_decision: payload.decision,
    p_handler_id: auth.actor.userId,
  }));
}

const defaultDeps: HandleFulfillmentAppealDeps = {
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
  loadAppealOwner: defaultLoadAppealOwner,
  handleAppealRpc: defaultHandleAppealRpc,
  writeAuditLog,
  emit,
  markDone,
  withRetry,
  withTimeout,
};

function logAppealOutcome(input: {
  observation: MutationObservation;
  stages: MutationStage[];
  actorId?: string | null;
  payload: HandleFulfillmentAppealPayload;
  status?: FulfillmentAppealStatus;
  businessSucceeded: boolean;
  auditSucceeded: boolean | null;
  employeeNotificationSucceeded: boolean | null;
  notificationMarked: boolean;
  compensationRequired: boolean;
}) {
  logApiRequest({
    requestId: input.observation.requestId,
    route: "/api/admin/fulfillment/appeal/handle",
    method: "POST",
    userId: input.actorId ?? null,
    outcome: input.businessSucceeded ? "success" : "rejected",
    detail: {
      actorId: input.actorId ?? null,
      appealId: input.payload.appealId,
      notificationId: input.payload.notificationId ?? null,
      decision: input.payload.decision,
      status: input.status ?? null,
      stages: input.stages,
      businessSucceeded: input.businessSucceeded,
      auditSucceeded: input.auditSucceeded,
      employeeNotificationSucceeded: input.employeeNotificationSucceeded,
      todoMarked: input.notificationMarked,
      compensationRequired: input.compensationRequired,
    },
  });
}

function createContext(observation: MutationObservation, actorId: string, payload: HandleFulfillmentAppealPayload): RequestContext {
  return createRequestContext({
    requestId: observation.requestId,
    actorId,
    route: "/api/admin/fulfillment/appeal/handle",
    operation: "handle_fulfillment_appeal",
    targetId: payload.appealId,
  });
}

async function tryMarkDone(deps: HandleFulfillmentAppealDeps, payload: HandleFulfillmentAppealPayload, actorId: string) {
  if (!payload.notificationId) return false;
  try {
    return await deps.markDone(payload.notificationId, actorId);
  } catch {
    return false;
  }
}

export async function buildHandleFulfillmentAppealResponse(
  input: unknown,
  deps: HandleFulfillmentAppealDeps = defaultDeps,
  observation?: MutationObservation,
): Promise<NextResponse> {
  const stages: MutationStage[] = [];
  const mark = (stage: MutationStage) => {
    if (!stages.includes(stage)) stages.push(stage);
    observation?.mark(stage);
  };
  mark("validate");
  const payload = parseHandleFulfillmentAppealPayload(input);
  if ("response" in payload) return payload.response;

  mark("auth");
  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) return responseFromAuthFailure(auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 }));
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return responseFromAuthFailure(forbidden);

  const context = createContext(observation ?? { requestId: crypto.randomUUID(), mark: () => undefined }, auth.actor.userId, payload.data);
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
    const notificationMarked = await tryMarkDone(deps, payload.data, auth.actor.userId);
    if (!notificationMarked && payload.data.notificationId) mark("compensate");
    const result = createOperationResult({
      context,
      data: { status: "already_handled" as const, notificationMarked },
      businessSucceeded: true,
      permissionChecked: true,
      auditSucceeded: true,
      notificationSucceeded: true,
      todoMarked: notificationMarked,
      compensationRequired: Boolean(payload.data.notificationId && !notificationMarked),
    });
    const response = NextResponse.json({
      ok: true,
      status: result.data?.status,
      notificationMarked: result.todoMarked === true,
      businessSucceeded: result.businessSucceeded,
      auditSucceeded: result.auditSucceeded === true,
      employeeNotificationSucceeded: result.notificationSucceeded === true,
    });
    logAppealOutcome({ observation: observation ?? { requestId: context.requestId, mark: () => undefined }, stages, actorId: auth.actor.userId, payload: payload.data, status: "already_handled", businessSucceeded: result.businessSucceeded, auditSucceeded: result.auditSucceeded, employeeNotificationSucceeded: result.notificationSucceeded, notificationMarked, compensationRequired: result.compensationRequired });
    return response;
  }
  if (rpcResult.error) return failureResponse(new AppError({ code: "RPC_FAILED", message: errorText(rpcResult.error) ?? "rpc failed" }));

  const rpcData = isRecord(rpcResult.data) ? rpcResult.data : null;
  const status = rpcData?.status;
  if (status !== "approved" && status !== "rejected") return failureResponse(new AppError({ code: "RPC_FAILED", message: "rpc returned invalid status" }));

  let auditResult: AuditLogWriteResult = { ok: true };
  if (status === "rejected") {
    auditResult = await deps.writeAuditLog(auth.supabase, {
      userId: auth.actor.userId,
      action: "handle_fulfillment_appeal",
      target: payload.data.appealId,
      detail: buildFulfillmentAppealRejectionAuditDetail({
        appealId: payload.data.appealId,
        accountId: appealOwnerResult.data.account_id,
        recordDate: appealOwnerResult.data.record_date,
        reason: payload.data.reason ?? "",
      }),
    });
  }
  if (!auditResult.ok) {
    mark("compensate");
    const notificationMarked = await tryMarkDone(deps, payload.data, auth.actor.userId);
    const response = failureResponse(new AppError({ code: "AUDIT_FAILED", message: auditResult.message }), { businessSucceeded: true, notificationMarked, auditSucceeded: false, employeeNotificationSucceeded: false });
    logAppealOutcome({ observation: observation ?? { requestId: context.requestId, mark: () => undefined }, stages, actorId: auth.actor.userId, payload: payload.data, status, businessSucceeded: true, auditSucceeded: false, employeeNotificationSucceeded: false, notificationMarked, compensationRequired: true });
    return response;
  }

  const notification: EmitResult = await deps.emit({
    recipients: [appealOwnerResult.data.user_id],
    type: "fulfillment.appeal.result",
    category: "feed",
    severity: status === "approved" ? "success" : "warning",
    title: status === "approved" ? "补交申请已通过" : "补交申请已驳回",
    body: status === "approved"
      ? `${appealOwnerResult.data.record_date} 的数据补交申请已通过，可继续上传。`
      : buildFulfillmentAppealRejectionNotification(appealOwnerResult.data.record_date, payload.data.reason ?? ""),
    actionLabel: status === "approved" ? "去上传数据" : null,
    actionUrl: status === "approved" ? "/dashboard" : null,
    sourceType: "fulfillment_appeal_result",
    sourceId: payload.data.appealId,
    payload: { appealId: payload.data.appealId, accountId: appealOwnerResult.data.account_id, status, ...(status === "rejected" ? { reason: payload.data.reason ?? "" } : {}) },
  });
  if (!notification.ok) {
    mark("compensate");
    const notificationMarked = await tryMarkDone(deps, payload.data, auth.actor.userId);
    const response = failureResponse(new AppError({ code: "EMPLOYEE_NOTIFICATION_FAILED", message: notification.error ?? "notification failed" }), { businessSucceeded: true, notificationMarked, auditSucceeded: true, employeeNotificationSucceeded: false });
    logAppealOutcome({ observation: observation ?? { requestId: context.requestId, mark: () => undefined }, stages, actorId: auth.actor.userId, payload: payload.data, status, businessSucceeded: true, auditSucceeded: true, employeeNotificationSucceeded: false, notificationMarked, compensationRequired: true });
    return response;
  }

  const notificationMarked = await tryMarkDone(deps, payload.data, auth.actor.userId);
  if (!notificationMarked && payload.data.notificationId) mark("compensate");
  mark("finalize");
  const result = createOperationResult({
    context,
    data: { status: status as "approved" | "rejected", notificationMarked },
    businessSucceeded: true,
    permissionChecked: true,
    auditSucceeded: true,
    notificationSucceeded: true,
    todoMarked: notificationMarked,
    compensationRequired: Boolean(payload.data.notificationId && !notificationMarked),
  });
  const response = NextResponse.json({
    ok: true,
    status: result.data?.status,
    notificationMarked: result.todoMarked === true,
    businessSucceeded: result.businessSucceeded,
    auditSucceeded: result.auditSucceeded === true,
    employeeNotificationSucceeded: result.notificationSucceeded === true,
  });
  logAppealOutcome({ observation: observation ?? { requestId: context.requestId, mark: () => undefined }, stages, actorId: auth.actor.userId, payload: payload.data, status, businessSucceeded: result.businessSucceeded, auditSucceeded: result.auditSucceeded, employeeNotificationSucceeded: result.notificationSucceeded, notificationMarked, compensationRequired: result.compensationRequired });
  return response;
}

export async function POST(request: Request) {
  return observeMutation("/api/admin/fulfillment/appeal/handle", async (observation) => {
    const body = await readJsonBody(request);
    if ("response" in body) return body.response ?? failureResponse(new AppError({ code: "INVALID_INPUT", message: "body" }));
    return buildHandleFulfillmentAppealResponse(body.data, defaultDeps, observation);
  });
}
