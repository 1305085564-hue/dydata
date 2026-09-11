import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

type ProfileRow = {
  id: string;
  name: string | null;
  membership_status?: string | null;
};

export async function GET() {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const permissionContext = await buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  const activeVisibleUserIds = permissionContext.scope.activeVisibleUserIds ?? [];
  if (activeVisibleUserIds.length === 0) {
    return NextResponse.json({ profiles: [] });
  }

  const result = await createAdminClient()
    .from("profiles")
    .select("id, name, membership_status")
    .in("id", activeVisibleUserIds);
  assertSupabaseQuerySucceeded(result.error, "加载可对比成员失败");

  const activeSet = new Set(activeVisibleUserIds);
  const profiles = ((result.data ?? []) as ProfileRow[])
    .filter((profile) => activeSet.has(profile.id) && profile.membership_status !== "archived")
    .map((profile) => ({
      id: profile.id,
      name: profile.name?.trim() || "未命名成员",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh"));

  return NextResponse.json({ profiles });
}
