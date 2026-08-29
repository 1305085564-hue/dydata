import { NextResponse } from "next/server";

import { buildOperatorMemberOptions, type OperatorMemberRow } from "@/lib/operator-members";
import { filterActiveMemberships, isMissingMembershipStatusError, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  const profile = (fallbackProfileResult?.data ?? profileResult.data) as {
    id: string;
    team_id: string | null;
    membership_status?: string | null;
  } | null;
  const profileError = fallbackProfileResult?.error ?? profileResult.error;
  if (profileError || !profile) {
    return NextResponse.json({ error: "加载当前成员资料失败" }, { status: 500 });
  }
  if (profile.membership_status === "archived") {
    return NextResponse.json({ error: "已归档账号不能参与当前操作" }, { status: 403 });
  }

  const membersResult = await loadWithMembershipFallback({
    loadWithMembership: async () => {
      let query = adminSupabase
        .from("profiles")
        .select("id, name, team_id, membership_status")
        .order("name", { ascending: true });
      if (profile.team_id) {
        query = query.eq("team_id", profile.team_id);
      } else {
        query = query.eq("id", user.id);
      }
      return query;
    },
    loadWithoutMembership: async () => {
      let query = adminSupabase
        .from("profiles")
        .select("id, name, team_id")
        .order("name", { ascending: true });
      if (profile.team_id) {
        query = query.eq("team_id", profile.team_id);
      } else {
        query = query.eq("id", user.id);
      }
      return query;
    },
  });
  const members = filterActiveMemberships((membersResult.data ?? []) as Array<OperatorMemberRow & { membership_status?: string | null }>);
  const membersError = membersResult.error;
  if (membersError) {
    return NextResponse.json({ error: "加载责任人候选失败" }, { status: 500 });
  }

  const teamIds = [...new Set((members ?? []).map((member) => member.team_id).filter((id): id is string => Boolean(id)))];
  const [{ data: teams, error: teamsError }] = await Promise.all([
    teamIds.length ? adminSupabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (teamsError) {
    return NextResponse.json({ error: "加载责任人组织信息失败" }, { status: 500 });
  }

  return NextResponse.json({
    currentUserId: user.id,
    members: buildOperatorMemberOptions((members ?? []) as OperatorMemberRow[], teams ?? []),
  });
}
