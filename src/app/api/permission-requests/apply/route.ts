import { NextResponse } from "next/server";

import { resolveBusinessRole } from "@/lib/business-role";
import { emit } from "@/lib/notifications/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Permissions, UserRole } from "@/types";

export const dynamic = "force-dynamic";

type PermissionRequestApplyDeps = {
  createClient: typeof createClient;
  createAdminClient: typeof createAdminClient;
  emit: typeof emit;
};

const defaultDeps: PermissionRequestApplyDeps = {
  createClient,
  createAdminClient,
  emit,
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type AdminCandidateRow = {
  id: string;
  role: UserRole;
  permissions: Permissions | null;
  team_id: string | null;
};

export async function buildPermissionRequestApplyResponse(
  request: Request,
  deps: PermissionRequestApplyDeps = defaultDeps,
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
    .select("id, name, team_id")
    .eq("id", user.id)
    .single();

  if (requesterError || !requesterProfile) {
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }
  const requesterName = toTrimmedString(requesterProfile.name) || "未知用户";

  const { data: adminProfiles, error: adminError } = await admin
    .from("profiles")
    .select("id, role, permissions, team_id")
    .in("role", ["owner", "admin"]);

  if (adminError) {
    return NextResponse.json({ error: "查询管理员失败，请稍后重试" }, { status: 500 });
  }

  const recipients = ((adminProfiles ?? []) as AdminCandidateRow[])
    .filter((profile) => {
      if (profile.id === user.id) return false;
      const businessRole = resolveBusinessRole({
        id: profile.id,
        role: profile.role,
        permissions: profile.permissions,
        team_id: profile.team_id,
      });
      if (businessRole === "owner") return true;
      return businessRole === "team_admin" && profile.team_id === requesterProfile.team_id;
    })
    .map((profile) => profile.id);

  if (recipients.length === 0) {
    return NextResponse.json({
      ok: true,
      notified: 0,
      warning: "当前没有可通知的管理员，请直接联系系统负责人",
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
    actionLabel: "前往成员管理处理",
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
  return buildPermissionRequestApplyResponse(request);
}
