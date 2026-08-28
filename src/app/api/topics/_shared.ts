import { NextResponse } from "next/server";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CurrentPermissionContext } from "@/lib/current-permission-context";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TEAM_MEMBERSHIP_REQUIRED = "TEAM_MEMBERSHIP_REQUIRED" as const;
export const TEAM_MEMBERSHIP_REQUIRED_MESSAGE = "请先申请加入团队" as const;

export type TeamMembershipProfile = {
  membership_status?: unknown;
  membershipStatus?: unknown;
  team_id?: string | null;
  teamId?: string | null;
};

export function isActiveTeamMembership(profile: TeamMembershipProfile | null | undefined) {
  const membershipStatus = profile?.membership_status ?? profile?.membershipStatus;
  const teamId = profile?.team_id ?? profile?.teamId;
  return membershipStatus === "active" && Boolean(teamId);
}

export function teamMembershipRequiredResponse() {
  return NextResponse.json(
    { error: TEAM_MEMBERSHIP_REQUIRED_MESSAGE, code: TEAM_MEMBERSHIP_REQUIRED },
    { status: 403 },
  );
}

export type TopicsApiContext = {
  userId: string;
  supabase: SupabaseClient;
  permissionContext: CurrentPermissionContext;
};

export async function requireTopicsContext(): Promise<
  { ok: true; context: TopicsApiContext } | { ok: false; response: NextResponse }
> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }

  const permissionContext = await getCurrentPermissionContext();
  if (!permissionContext) {
    return { ok: false, response: NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 }) };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      supabase: createAdminClient(),
      permissionContext,
    },
  };
}

export async function requireActiveTeamContext(
  dependencies: {
    requireTopicsContext?: typeof requireTopicsContext;
  } = {},
): Promise<
  { ok: true; context: TopicsApiContext } | { ok: false; response: NextResponse }
> {
  const auth = await (dependencies.requireTopicsContext ?? requireTopicsContext)();
  if (!auth.ok) return auth;

  if (!isActiveTeamMembership(auth.context.permissionContext.permissionInfo)) {
    return { ok: false, response: teamMembershipRequiredResponse() };
  }

  return auth;
}

export function jsonResult<T>(result: { ok: true; value: T } | { ok: false; status: number; message: string }) {
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json(result.value);
}
