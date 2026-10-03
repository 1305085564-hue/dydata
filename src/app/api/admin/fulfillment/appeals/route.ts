import { NextRequest, NextResponse } from "next/server";

import { filterScopedRows } from "../../cockpit/_shared";
import { getActiveVisibleUserIds } from "@/lib/data-access-scope";
import { requireAdminServiceClient, requireOwnerOrAdminRole } from "../_shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emit } from "@/lib/notifications/server";
import { isActiveMembership } from "@/lib/member-lifecycle";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import { validateVideoSubmitPayload } from "@/app/api/video-submit/validation";

const APPEAL_STATUSES = new Set(["pending", "approved", "rejected"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
  const limitValue = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 200)) : 50;

  let query = auth.supabase
    .from("fulfillment_appeals")
    .select("id, user_id, account_id, record_date, reason, status, handler_id, handled_at, created_at")
    .order("created_at", { ascending: false });

  if (APPEAL_STATUSES.has(status)) {
    query = query.eq("status", status);
  }

  query = query.in("user_id", getActiveVisibleUserIds(auth.scope));

  query = query.limit(limit);

  const appealsResult = await query;
  if (appealsResult.error) {
    return NextResponse.json({ error: appealsResult.error.message || "读取履约申诉失败" }, { status: 500 });
  }

  const scopedAppeals = filterScopedRows(auth.scope, appealsResult.data, (row) => row.user_id);
  const relatedUserIds = Array.from(
    new Set(
      scopedAppeals
        .flatMap((item) => [item.user_id, item.handler_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const profileMap = new Map<string, { name: string | null }>();
  if (relatedUserIds.length > 0) {
    const profilesResult = await auth.supabase.from("profiles").select("id, name").in("id", relatedUserIds);
    if (profilesResult.error) {
      return NextResponse.json({ error: profilesResult.error.message || "读取申诉成员信息失败" }, { status: 500 });
    }

    for (const profile of profilesResult.data ?? []) {
      profileMap.set(profile.id, { name: profile.name ?? null });
    }
  }

  return NextResponse.json({
    appeals: scopedAppeals.map((item) => ({
      ...item,
      user_name: profileMap.get(item.user_id)?.name ?? null,
      handler_name: item.handler_id ? profileMap.get(item.handler_id)?.name ?? null : null,
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

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

  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("id, profile_id, name")
    .eq("id", accountId)
    .single();
  if (accountError || !account || account.profile_id !== user.id) {
    return NextResponse.json({ error: "账号不存在或无权限申请" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await admin
    .from("fulfillment_appeals")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("record_date", recordDate)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "核对已有申请失败" }, { status: 500 });
  if (existing) return NextResponse.json({ error: "该账号该日期已有待审批申请", appealId: existing.id }, { status: 409 });

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
  if (insertError || !appeal) return NextResponse.json({ error: insertError?.message || "提交补交申请失败" }, { status: 500 });

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
    return NextResponse.json({ error: "申请已提交，但管理通知发送失败，请联系管理员" }, { status: 500 });
  }
  return NextResponse.json({ appeal, notified: notification.inserted });
}
