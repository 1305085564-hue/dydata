import { NextResponse } from "next/server";

import { buildOperatorMemberOptions, type OperatorMemberRow } from "@/lib/operator-members";
import { filterActiveMemberships, isMissingMembershipStatusError, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type OperatorProfile = {
  id: string;
  team_id: string | null;
  membership_status?: string | null;
};

type OperatorMembersQueryResult = {
  data: Array<OperatorMemberRow & { membership_status?: string | null }> | null;
  error: { message?: string } | null;
};

type OperatorTeamsQueryResult = {
  data: Array<{ id: string; name: string | null }> | null;
  error: { message?: string } | null;
};

export async function buildOperatorMembersResponse(input: {
  userId: string;
  profile: OperatorProfile;
  loadMembers: (profile: OperatorProfile) => Promise<OperatorMembersQueryResult>;
  loadTeams: (teamIds: string[]) => Promise<OperatorTeamsQueryResult>;
}) {
  if (input.profile.membership_status === "archived") {
    return NextResponse.json({ error: "已归档账号不能参与当前操作" }, { status: 403 });
  }

  const teamIds = input.profile.team_id ? [input.profile.team_id] : [];
  const [membersResult, teamsResult] = await Promise.all([
    input.loadMembers(input.profile),
    input.loadTeams(teamIds),
  ]);
  if (membersResult.error) {
    return NextResponse.json({ error: "加载责任人候选失败" }, { status: 500 });
  }
  if (teamsResult.error) {
    return NextResponse.json({ error: "加载责任人组织信息失败" }, { status: 500 });
  }

  const members = filterActiveMemberships(membersResult.data ?? []);
  return NextResponse.json({
    currentUserId: input.userId,
    members: buildOperatorMemberOptions(members, teamsResult.data ?? []),
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const profileResult = await adminSupabase
    .from("profiles")
    .select("id, team_id, membership_status")
    .eq("id", user.id)
    .maybeSingle();
  const fallbackProfileResult = profileResult.error && isMissingMembershipStatusError(profileResult.error)
    ? await adminSupabase
      .from("profiles")
      .select("id, team_id")
      .eq("id", user.id)
      .maybeSingle()
    : null;
  const profile = (fallbackProfileResult?.data ?? profileResult.data) as OperatorProfile | null;
  const profileError = fallbackProfileResult?.error ?? profileResult.error;
  if (profileError || !profile) {
    return NextResponse.json({ error: "加载当前成员资料失败" }, { status: 500 });
  }
  return buildOperatorMembersResponse({
    userId: user.id,
    profile,
    loadMembers: async (currentProfile) => loadWithMembershipFallback({
      loadWithMembership: async () => {
        let query = adminSupabase
          .from("profiles")
          .select("id, name, team_id, membership_status")
          .eq("membership_status", "active");
        query = currentProfile.team_id
          ? query.eq("team_id", currentProfile.team_id)
          : query.eq("id", user.id);
        return query;
      },
      loadWithoutMembership: async () => {
        let query = adminSupabase
          .from("profiles")
          .select("id, name, team_id");
        query = currentProfile.team_id
          ? query.eq("team_id", currentProfile.team_id)
          : query.eq("id", user.id);
        return query;
      },
    }) as Promise<OperatorMembersQueryResult>,
    loadTeams: async (teamIds) => teamIds.length
      ? adminSupabase.from("teams").select("id, name").in("id", teamIds) as unknown as Promise<OperatorTeamsQueryResult>
      : { data: [], error: null },
  });
}
