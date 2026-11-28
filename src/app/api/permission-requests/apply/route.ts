import { readQueryPages } from "@/lib/supabase/paged-query";
import { NextResponse } from "next/server";

import { emit } from "@/lib/notifications/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { isActiveMembership } from "@/lib/member-lifecycle";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { UserRole } from "@/types";

export const dynamic = "force-dynamic";

type PermissionRequestApplyDeps = {
  createClient: typeof createClient;
  createAdminClient: typeof createAdminClient;
  emit: typeof emit;
};

export const defaultPermissionRequestApplyDeps: PermissionRequestApplyDeps = {
  createClient,
  createAdminClient,
  emit,
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type OwnerCandidateRow = {
  id: string;
  role: UserRole;
  company_role?: "member" | "admin" | "company_owner" | null;
  membership_status?: string | null;
};

export async function buildPermissionRequestApplyResponse(
  request: Request,
  deps: PermissionRequestApplyDeps = defaultPermissionRequestApplyDeps,
  observation?: MutationObservation,
) {
  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const moduleTitle = toTrimmedString(body.moduleTitle);
  if (!moduleTitle) {
    return NextResponse.json({ error: "缺少模块名称" }, { status: 400 });
  }
  const currentPath = toTrimmedString(body.currentPath);

  const admin = deps.createAdminClient();

  const { data: requesterProfile, error: requesterError } = await admin
    .from("profiles")
    .select("id, name, team_id, membership_status")
    .eq("id", user.id)
    .single();

  if (requesterError || !requesterProfile) {
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }
  if (!isActiveMembership(requesterProfile)) {
    return NextResponse.json({ error: "归档账号不能申请权限" }, { status: 403 });
  }
  const requesterName = toTrimmedString(requesterProfile.name) || "未知用户";

  const requesterTeamId = toTrimmedString(requesterProfile.team_id);
  if (!requesterTeamId) return NextResponse.json({ error: "请先申请加入团队" }, { status: 403 });

  // 权限申请只发公司负责人：角色调整由负责人在成员管理里决定，组长没有这个权限，发给他们只会变成无法处理的待办
  let { data: adminProfiles, error: adminError } = await readQueryPages((from, to, signal) => admin
    .from("profiles")
    .select("id, role, company_role, membership_status")
    .in("role", ["owner", "admin"])
    .eq("team_id", requesterTeamId).order("id", { ascending: true }).range(from, to).abortSignal(signal));

  if (adminError?.message?.includes("company_role")) {
    const legacy = await readQueryPages((from, to, signal) => admin
      .from("profiles")
      .select("id, role, membership_status")
      .in("role", ["owner", "admin"])
    .eq("team_id", requesterTeamId).order("id", { ascending: true }).range(from, to).abortSignal(signal));
    adminProfiles = legacy.data as typeof adminProfiles;
    adminError = legacy.error;
  }

  if (adminError) {
    return NextResponse.json({ error: "查询管理员失败，请稍后重试" }, { status: 500 });
  }

  const recipients = ((adminProfiles ?? []) as OwnerCandidateRow[])
    .filter((profile) => {
      if (profile.id === user.id) return false;
      if (!isActiveMembership(profile)) return false;
      const roleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
      return !roleResolution.conflict && roleResolution.companyRole === "company_owner";
    })
    .map((profile) => profile.id);

  if (recipients.length === 0) {
    return NextResponse.json({
      ok: true,
      notified: 0,
      warning: "当前没有可通知的公司负责人，请直接联系系统负责人",
    });
  }

  const sourceId = `${user.id}:${moduleTitle}`;
  const result = await deps.emit({
    recipients,
    type: "permission.request",
    category: "todo",
    severity: "warning",
    title: `${requesterName} 申请「${moduleTitle}」权限`,
    body: currentPath ? `申请页面：${currentPath}` : null,
    actionLabel: "前往成员管理调整角色",
    actionUrl: `/admin/modules?member=${user.id}`,
    sourceType: "permission_request",
    sourceId,
    payload: {
      requesterId: user.id,
      requesterName,
      moduleTitle,
      currentPath: currentPath ?? null,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: "通知发送失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notified: result.inserted });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/permission-requests/apply", request, async (observation) =>
    appendObservedMutationResult(
      await buildPermissionRequestApplyResponse(request, defaultPermissionRequestApplyDeps, observation),
      observation,
    ),
  );
}
