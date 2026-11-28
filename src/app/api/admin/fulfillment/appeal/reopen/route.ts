import { readQueryPages } from "@/lib/supabase/paged-query";
import { NextResponse } from "next/server";
import { UUID_PATTERN, requireAdminServiceClient, requireActiveVisibleUsers, requireOwnerOrAdminRole, readJsonBody } from "../../_shared";
import { emit } from "@/lib/notifications/server";
import { hasFixedPermission, resolveProfileCompanyRole } from "@/lib/company-permissions";
import { isActiveMembership } from "@/lib/member-lifecycle";
import { clearCollaborationMonthCache } from "@/lib/loaders/collaboration-month-cache";
import { toStringErrorResponse } from "@/lib/errors";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type LayerStatus = "succeeded" | "failed" | "skipped";
type MutationLayers = {
  businessSucceeded: boolean;
  auditStatus: LayerStatus;
  employeeNotificationStatus: LayerStatus;
  todoStatus: LayerStatus;
};

export type ReopenFulfillmentAppealDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
  requireActiveVisibleUsers: typeof requireActiveVisibleUsers;
  emit: typeof emit;
};

export async function buildReopenFulfillmentAppealResponse(
  request: Request,
  observation: MutationObservation,
  layers: MutationLayers,
  deps: ReopenFulfillmentAppealDeps = {
    requireAdminServiceClient,
    requireOwnerOrAdminRole,
    requireActiveVisibleUsers,
    emit,
  },
) {
  observation.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  const appealId = typeof body.data?.appealId === "string" ? body.data.appealId.trim() : "";
  if (!UUID_PATTERN.test(appealId)) return NextResponse.json({ error: "appealId 必须是 uuid" }, { status: 400 });

  observation.mark("auth");
  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;

  observation.mark("read");
  let appealResult = await auth.supabase
    .from("fulfillment_appeals")
    .select("id, user_id, account_id, record_date, reason, status, review_mode, video_id, daily_report_id")
    .eq("id", appealId)
    .maybeSingle();
  if (appealResult.error && /review_mode|video_id|daily_report_id|schema cache|column .* does not exist/i.test(appealResult.error.message ?? "")) {
    appealResult = await auth.supabase
      .from("fulfillment_appeals")
      .select("id, user_id, account_id, record_date, reason, status")
      .eq("id", appealId)
      .maybeSingle() as typeof appealResult;
  }
  if (appealResult.error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/appeal/reopen",
      operation: "load-appeal",
      request,
      requestId: observation.requestId,
      error: appealResult.error,
      status: 500,
      message: "读取补交申诉失败",
    });
  }
  if (!appealResult.data) return NextResponse.json({ error: "补交申诉不存在" }, { status: 404 });
  const isPostSubmit = appealResult.data.review_mode === "post_submit";
  observation.mark("scope");
  const scoped = deps.requireActiveVisibleUsers(auth, [appealResult.data.user_id]);
  if (scoped) return scoped;
  if (appealResult.data.status !== "approved" && appealResult.data.status !== "rejected") {
    return NextResponse.json({ error: isPostSubmit ? "仅支持打回已处理的事后核查单" : "仅支持打回已处理的补交申诉" }, { status: 409 });
  }

  observation.mark("review-rpc");
  const rpc = await auth.userSupabase.rpc("reopen_fulfillment_appeal_atomically", {
    p_appeal_id: appealId,
    p_handler_id: auth.actor.userId,
  });
  if (rpc.error) {
    return toStringErrorResponse({
      code: "CONFLICT",
      route: "/api/admin/fulfillment/appeal/reopen",
      operation: "reopen-appeal-rpc",
      request,
      requestId: observation.requestId,
      error: rpc.error,
      status: 409,
      message: isPostSubmit ? "打回事后核查单失败，请刷新后重试" : "打回补交申诉失败，请刷新后重试",
    });
  }
  if (isPostSubmit) clearCollaborationMonthCache();
  layers.businessSucceeded = true;
  layers.auditStatus = "succeeded";

  // 作废旧的通过/驳回结果通知；新的审批结果会由后续处理动作重新发送。
  observation.mark("write-request");
  await auth.supabase
    .from("notifications")
    .update({ status: "done", done_at: new Date().toISOString(), expires_at: new Date().toISOString() })
    .eq("source_type", "fulfillment_appeal_result")
    .eq("source_id", appealId);

  const requester = await auth.supabase.from("profiles").select("name, team_id").eq("id", appealResult.data.user_id).maybeSingle();
  const candidates = await readQueryPages((from, to, signal) => auth.supabase
    .from("profiles")
    .select("id, role, company_role, team_id, membership_status")
    .in("role", ["owner", "admin"]).order("id", { ascending: true }).range(from, to).abortSignal(signal));
  const recipients = (candidates.data ?? [])
    .filter((profile) => {
      if (!isActiveMembership(profile) || profile.team_id !== requester.data?.team_id) return false;
      const role = resolveProfileCompanyRole(profile.role, profile.company_role);
      return !role.conflict && hasFixedPermission(role.companyRole, "manage_members");
    })
    .map((profile) => profile.id);
  const notification = await deps.emit({
    recipients,
    type: "fulfillment.appeal",
    category: "todo",
    severity: "warning",
    title: isPostSubmit
      ? `${requester.data?.name || "成员"}的事后核查已打回待处理`
      : `${requester.data?.name || "成员"}的补交申诉已打回待审批`,
    body: `${appealResult.data.record_date}\n${appealResult.data.reason}`,
    actionLabel: isPostSubmit ? "去核查" : "处理补交申请",
    actionUrl: "/admin/fulfillment",
    sourceType: "fulfillment_appeal",
    sourceId: appealId,
    payload: {
      appealId,
      accountId: appealResult.data.account_id,
      recordDate: appealResult.data.record_date,
      userId: appealResult.data.user_id,
      reviewMode: isPostSubmit ? "post_submit" : "pre_submit",
      reopened: true,
    },
  });
  layers.todoStatus = notification.ok ? "succeeded" : "failed";
  if (!notification.ok) observation.mark("compensate");
  observation.mark("finalize");

  return NextResponse.json({
    ok: true,
    appealId,
    status: "pending",
    reviewMode: isPostSubmit ? "post_submit" : "pre_submit",
    settlementRestored: isPostSubmit && appealResult.data.status === "rejected",
    oldResultNotificationsVoided: true,
    todoReissued: notification.ok,
  });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/admin/fulfillment/appeal/reopen", request, async (observation) => {
    const layers: MutationLayers = {
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    };
    observation.setDetail?.(layers);
    const response = await buildReopenFulfillmentAppealResponse(request, observation, layers);
    observation.setDetail?.(layers);
    return appendObservedMutationResult(response, observation);
  });
}
