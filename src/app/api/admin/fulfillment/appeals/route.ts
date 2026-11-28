import { NextRequest, NextResponse } from "next/server";

import { filterScopedRows } from "@/lib/admin/cockpit";
import { requireAdminServiceClient, requireOwnerOrAdminRole } from "../_shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emit } from "@/lib/notifications/server";
import { isActiveMembership } from "@/lib/member-lifecycle";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import { validateVideoSubmitPayload } from "@/app/api/video-submit/validation";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { mapAppealRowForResponse } from "./_appeal-response";
import { buildPublishedDayWindow, resolveCreateSubmissionConflict } from "@/app/api/video-submit/create-conflict";
import { buildSubmissionRecordId } from "@/app/api/video-submit/stability";
import { toStringErrorResponse } from "@/lib/errors";

const APPEAL_STATUSES = new Set(["pending", "approved", "rejected"]);

export type FulfillmentAppealsGetDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
};

export async function buildFulfillmentAppealsGetResponse(
  request: NextRequest,
  deps: FulfillmentAppealsGetDeps = { requireAdminServiceClient, requireOwnerOrAdminRole },
) {
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
  if (status && !APPEAL_STATUSES.has(status) && status !== "handled") {
    return NextResponse.json({ error: "申诉状态不正确" }, { status: 400 });
  }
  const limitValue = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 200)) : 50;

  const offsetValue = Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "", 10);
  const offset = Number.isFinite(offsetValue) ? Math.max(0, offsetValue) : 0;
  const visibleIds = status === "pending" ? auth.scope.activeVisibleUserIds : auth.scope.visibleUserIds;
  const buildAppealsQuery = (columns: string) => {
    let query = auth.supabase
      .from("fulfillment_appeals")
      .select(columns)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    if (APPEAL_STATUSES.has(status)) query = query.eq("status", status);
    if (status === "handled") query = query.in("status", ["approved", "rejected"]);
    if (!status) query = query.or(`status.neq.pending,user_id.in.(${auth.scope.activeVisibleUserIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);
    return query.in("user_id", visibleIds).range(offset, offset + limit - 1);
  };

  let appealsResult = await buildAppealsQuery(
    "id, user_id, record_date, reason, status, handler_id, handled_at, created_at, submission_payload, review_mode, video_id, daily_report_id, trigger_reason, elapsed_hours",
  );
  if (appealsResult.error && /review_mode|video_id|daily_report_id|trigger_reason|elapsed_hours|schema cache|column .* does not exist/i.test(appealsResult.error.message ?? "")) {
    appealsResult = await buildAppealsQuery(
      "id, user_id, record_date, reason, status, handler_id, handled_at, created_at, submission_payload",
    );
  }
  if (appealsResult.error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/appeals",
      operation: "list-appeals",
      request,
      error: appealsResult.error,
      status: 500,
      message: "读取履约申诉失败",
    });
  }

  const scopedAppeals = filterScopedRows(auth.scope, (appealsResult.data ?? []) as unknown as Array<Parameters<typeof mapAppealRowForResponse>[0]>, (row) => row.user_id);
  const relatedUserIds = Array.from(new Set(
    scopedAppeals
      .flatMap((item) => [item.user_id, item.handler_id])
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  ));
  // gate:transient-map 请求内按 user_id 映射申诉成员姓名，随响应返回释放
  const profileMap = new Map<string, { name: string | null }>();
  if (relatedUserIds.length > 0) {
    const profilesResult = await auth.supabase.from("profiles").select("id, name").in("id", relatedUserIds);
    if (profilesResult.error) {
      return toStringErrorResponse({
        code: "DEPENDENCY_FAILED",
        route: "/api/admin/fulfillment/appeals",
        operation: "load-appeal-profiles",
        request,
        error: profilesResult.error,
        status: 500,
        message: "读取申诉成员信息失败",
      });
    }
    for (const profile of profilesResult.data ?? []) profileMap.set(profile.id, { name: profile.name ?? null });
  }

  return NextResponse.json({
    appeals: scopedAppeals.map((item) => mapAppealRowForResponse(item, profileMap)),
  });
}

export async function GET(request: NextRequest) {
  return buildFulfillmentAppealsGetResponse(request, {
    requireAdminServiceClient,
    requireOwnerOrAdminRole,
  });
}

type LayerStatus = "succeeded" | "failed" | "skipped";
type MutationLayers = {
  businessSucceeded: boolean;
  auditStatus: LayerStatus;
  employeeNotificationStatus: LayerStatus;
  todoStatus: LayerStatus;
};

async function handlePost(request: Request, observation: MutationObservation, layers: MutationLayers) {
  observation.mark("auth");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  observation.mark("validate");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const recordDate = typeof body.recordDate === "string" ? body.recordDate.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const submissionPayload = body.submissionPayload;
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || !reason) {
    return NextResponse.json({ error: "账号、业务日期和补交原因均为必填" }, { status: 400 });
  }
  if (reason.length > 1000) return NextResponse.json({ error: "补交原因不能超过 1000 字" }, { status: 400 });
  const submissionValidation = validateVideoSubmitPayload(submissionPayload);
  if (!submissionValidation.ok) {
    return NextResponse.json({ error: `待续交数据无效：${submissionValidation.error}` }, { status: 400 });
  }
  if (
    submissionValidation.normalized.account_id !== accountId
    || submissionValidation.normalized.biz_date !== recordDate
  ) {
    return NextResponse.json({ error: "补交申请与待续交数据的账号或日期不一致" }, { status: 400 });
  }
  if (JSON.stringify(submissionPayload).length > 250_000) {
    return NextResponse.json({ error: "待续交数据过大，请重新整理后提交" }, { status: 413 });
  }

  observation.mark("read");
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("id, profile_id, name")
    .eq("id", accountId)
    .single();
  if (accountError || !account || account.profile_id !== user.id) {
    return NextResponse.json({ error: "账号不存在或无权限申请" }, { status: 403 });
  }

  const normalized = submissionValidation.normalized;
  const submissionVideoId = buildSubmissionRecordId(normalized);
  const dayWindow = normalized.video_title ? buildPublishedDayWindow(normalized.published_at) : null;
  const [existingReportResult, existingVideoResult, existingSameDayResult] = await Promise.all([
    admin.from("daily_reports").select("id").eq("video_id", submissionVideoId).eq("user_id", user.id).eq("is_void", false).limit(1),
    admin.from("videos").select("id").eq("id", submissionVideoId).limit(1),
    dayWindow
      ? admin.from("videos").select("id").eq("account_id", accountId).eq("video_title", normalized.video_title).eq("lifecycle_state", "active").gte("published_at", dayWindow.start).lt("published_at", dayWindow.end).limit(1)
      : Promise.resolve({ data: [] as { id: string }[] | null, error: null }),
  ]);
  if (existingReportResult.error || existingVideoResult.error || existingSameDayResult.error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/appeals",
      operation: "check-duplicate-submission",
      request,
      requestId: observation.requestId,
      error: existingReportResult.error ?? existingVideoResult.error ?? existingSameDayResult.error,
      status: 500,
      message: "核对重复提交状态失败",
    });
  }
  const duplicateResponse = resolveCreateSubmissionConflict({
    mode: normalized.mode,
    existingReportWithSameVideo: (existingReportResult.data ?? []).length > 0,
    existingVideo: (existingVideoResult.data ?? []).length > 0,
    existingActiveWorkSameDay: (existingSameDayResult.data ?? []).length > 0,
  });
  if (duplicateResponse) {
    return NextResponse.json({ error: duplicateResponse.error, code: "SUBMISSION_DUPLICATE" }, { status: duplicateResponse.status });
  }

  const { data: existing, error: existingError } = await admin
    .from("fulfillment_appeals")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("record_date", recordDate)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/appeals",
      operation: "check-existing-appeal",
      request,
      requestId: observation.requestId,
      error: existingError,
      status: 500,
      message: "核对已有申请失败",
    });
  }
  if (existing) return NextResponse.json({ error: "该账号该日期已有待审批申请", appealId: existing.id }, { status: 409 });

  observation.mark("write-request");
  const { data: appeal, error: insertError } = await admin
    .from("fulfillment_appeals")
    .insert({
      user_id: user.id,
      account_id: accountId,
      record_date: recordDate,
      reason,
      status: "pending",
      submission_payload: submissionPayload,
    })
    .select("id, user_id, account_id, record_date, reason, status, created_at")
    .single();
  if (insertError || !appeal) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/appeals",
      operation: "create-appeal",
      request,
      requestId: observation.requestId,
      error: insertError ?? new Error("insert fulfillment appeal returned empty row"),
      status: 500,
      message: "提交补交申请失败",
    });
  }
  layers.businessSucceeded = true;

  const { data: requester } = await admin.from("profiles").select("name, team_id").eq("id", user.id).single();
  const { data: candidates } = await admin
    .from("profiles")
    .select("id, role, company_role, permissions, team_id, membership_status")
    .in("role", ["owner", "admin"]);
  const recipients = (candidates ?? [])
    .filter((profile) => {
      if (profile.id === user.id || !isActiveMembership(profile)) return false;
      const role = resolveProfileCompanyRole(profile.role, profile.company_role);
      return !role.conflict
        && (role.companyRole === "company_owner" || (role.companyRole === "admin" && profile.permissions?.manage_members === true))
        && profile.team_id === requester?.team_id;
    })
    .map((profile) => profile.id);

  const notification = await emit({
    recipients,
    type: "fulfillment.appeal",
    category: "todo",
    severity: "warning",
    title: `${requester?.name || "成员"}申请补交数据`,
    body: `${account.name || "账号"} · ${recordDate}\n${reason}`,
    actionLabel: "处理补交申请",
    actionUrl: "/admin/fulfillment",
    sourceType: "fulfillment_appeal",
    sourceId: appeal.id,
    payload: { appealId: appeal.id, accountId, recordDate, userId: user.id },
  });

  if (!notification.ok) {
    observation.mark("compensate");
    layers.todoStatus = "failed";
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/appeals",
      operation: "emit-appeal-todo",
      request,
      requestId: observation.requestId,
      error: notification.error ?? "emit fulfillment appeal todo failed",
      status: 500,
      message: "申请已提交，但管理通知发送失败，请联系管理员",
    });
  }
  layers.todoStatus = "succeeded";
  observation.mark("finalize");
  return NextResponse.json({ appeal, notified: notification.inserted });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/admin/fulfillment/appeals", request, async (observation) => {
    const layers: MutationLayers = {
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    };
    observation.setDetail?.(layers);
    const response = await handlePost(request, observation, layers);
    observation.setDetail?.(layers);
    return appendObservedMutationResult(response, observation);
  });
}
