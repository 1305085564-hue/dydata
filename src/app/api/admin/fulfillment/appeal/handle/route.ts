import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
  unwrapRpc,
} from "../../_shared";
import { emit } from "@/lib/notifications/server";
import { writeAuditLog } from "@/lib/audit-log";

export type FulfillmentAppealDecision = "approve" | "reject";

type HandleFulfillmentAppealPayload = {
  appealId: string;
  decision: FulfillmentAppealDecision;
  reason?: string;
};

export function buildFulfillmentAppealRejectionNotification(
  recordDate: string,
  reason: string,
) {
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

export function parseHandleFulfillmentAppealPayload(
  input: unknown,
): { data: HandleFulfillmentAppealPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const appealId = typeof input.appealId === "string" ? input.appealId.trim() : "";
  if (!UUID_PATTERN.test(appealId)) {
    return { response: NextResponse.json({ error: "appealId 必须是 uuid" }, { status: 400 }) };
  }

  const decision = typeof input.decision === "string" ? input.decision.trim() : "";
  if (decision !== "approve" && decision !== "reject") {
    return { response: NextResponse.json({ error: "decision 必须是 approve/reject" }, { status: 400 }) };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (decision === "reject" && !reason) {
    return { response: NextResponse.json({ error: "驳回时必须填写驳回原因" }, { status: 400 }) };
  }
  if (reason.length > 1000) {
    return { response: NextResponse.json({ error: "驳回原因不能超过 1000 字" }, { status: 400 }) };
  }

  return {
    data: {
      appealId,
      decision: decision as FulfillmentAppealDecision,
      ...(reason ? { reason } : {}),
    },
  };
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseHandleFulfillmentAppealPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const appealOwnerResult = await auth.supabase
    .from("fulfillment_appeals")
    .select("user_id, account_id, record_date")
    .eq("id", payload.data.appealId)
    .single();

  if (appealOwnerResult.error || !appealOwnerResult.data) {
    return NextResponse.json({ error: appealOwnerResult.error?.message || "申诉不存在" }, { status: 404 });
  }

  const scoped = requireActiveVisibleUsers(auth, [appealOwnerResult.data.user_id]);
  if (scoped) return scoped;

  const result = await auth.supabase.rpc("handle_fulfillment_appeal", {
    p_appeal_id: payload.data.appealId,
    p_decision: payload.data.decision,
    p_handler_id: auth.actor.userId,
  });
  const unwrapped = unwrapRpc<unknown>(result, "处理履约申诉失败");
  if ("response" in unwrapped) return unwrapped.response;

  const status = (unwrapped.data as { status?: string } | null)?.status;
  const rejectionReason = payload.data.reason ?? "";
  if (status === "rejected") {
    const audit = await writeAuditLog(auth.supabase, {
      userId: auth.actor.userId,
      action: "handle_fulfillment_appeal",
      target: payload.data.appealId,
      detail: buildFulfillmentAppealRejectionAuditDetail({
        appealId: payload.data.appealId,
        accountId: appealOwnerResult.data.account_id,
        recordDate: appealOwnerResult.data.record_date,
        reason: rejectionReason,
      }),
    });
    if (!audit.ok) {
      return NextResponse.json(
        { error: `补交申请已驳回，但审计留痕失败：${audit.message}` },
        { status: 500 },
      );
    }
  }

  const notification = await emit({
    recipients: [appealOwnerResult.data.user_id],
    type: "fulfillment.appeal.result",
    category: "feed",
    severity: status === "approved" ? "success" : "warning",
    title: status === "approved" ? "补交申请已通过" : "补交申请已驳回",
    body:
      status === "approved"
        ? `${appealOwnerResult.data.record_date} 的数据补交申请已通过，可继续上传。`
        : buildFulfillmentAppealRejectionNotification(
            appealOwnerResult.data.record_date,
            rejectionReason,
          ),
    actionLabel: status === "approved" ? "去上传数据" : null,
    actionUrl: status === "approved" ? "/dashboard" : null,
    sourceType: "fulfillment_appeal_result",
    sourceId: payload.data.appealId,
    payload: {
      appealId: payload.data.appealId,
      accountId: appealOwnerResult.data.account_id,
      status,
      ...(status === "rejected" ? { reason: rejectionReason } : {}),
    },
  });
  if (!notification.ok) {
    return NextResponse.json(
      { error: `补交申请已处理，但结果通知发送失败：${notification.error || "未知错误"}` },
      { status: 500 },
    );
  }

  return NextResponse.json(unwrapped.data ?? { ok: true });
}
