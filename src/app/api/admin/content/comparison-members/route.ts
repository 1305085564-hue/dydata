import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

type ProfileRow = {
  id: string;
  name: string | null;
  membership_status?: string | null;
};

type ComparisonMembersDependencies = {
  requireAdminActor: typeof requireAdminActor;
  canAccessAdminPath: typeof canAccessAdminPath;
  resolveVideoReviewReadOnlyScope: typeof resolveVideoReviewReadOnlyScope;
  createAdminClient: typeof createAdminClient;
  assertSupabaseQuerySucceeded: typeof assertSupabaseQuerySucceeded;
};

const defaultDependencies: ComparisonMembersDependencies = {
  requireAdminActor,
  canAccessAdminPath,
  resolveVideoReviewReadOnlyScope,
  createAdminClient,
  assertSupabaseQuerySucceeded,
};

export async function buildComparisonMembersResponse(deps: ComparisonMembersDependencies = defaultDependencies) {
  const auth = await deps.requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!deps.canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const permissionContext = auth.context;
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  const client = deps.createAdminClient();
  const scope = await deps.resolveVideoReviewReadOnlyScope(client, permissionContext.scope);
  const activeVisibleUserIds = scope.activeVisibleUserIds ?? [];
  if (activeVisibleUserIds.length === 0) {
    return NextResponse.json({ profiles: [] });
  }

  const result = await client
    .from("profiles")
    .select("id, name, membership_status")
    .in("id", activeVisibleUserIds);
  deps.assertSupabaseQuerySucceeded(result.error, "加载可对比成员失败");

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

export async function GET() {
  return buildComparisonMembersResponse();
}
