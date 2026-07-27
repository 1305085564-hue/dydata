import { NextResponse } from "next/server";

import { buildOperatorMemberOptions, type OperatorMemberRow } from "@/lib/operator-members";
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
  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, team_id, group_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ error: "加载当前成员资料失败" }, { status: 500 });
  }

  let membersQuery = adminSupabase
    .from("profiles")
    .select("id, name, team_id, group_id")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (profile.team_id) {
    membersQuery = membersQuery.eq("team_id", profile.team_id);
  } else if (profile.group_id) {
    membersQuery = membersQuery.eq("group_id", profile.group_id);
  } else {
    membersQuery = membersQuery.eq("id", user.id);
  }

  const { data: members, error: membersError } = await membersQuery;
  if (membersError) {
    return NextResponse.json({ error: "加载责任人候选失败" }, { status: 500 });
  }

  const teamIds = [...new Set((members ?? []).map((member) => member.team_id).filter((id): id is string => Boolean(id)))];
  const groupIds = [...new Set((members ?? []).map((member) => member.group_id).filter((id): id is string => Boolean(id)))];
  const [{ data: teams, error: teamsError }, { data: groups, error: groupsError }] = await Promise.all([
    teamIds.length ? adminSupabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [], error: null }),
    groupIds.length ? adminSupabase.from("groups").select("id, name, team_id").in("id", groupIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (teamsError || groupsError) {
    return NextResponse.json({ error: "加载责任人组织信息失败" }, { status: 500 });
  }

  return NextResponse.json({ members: buildOperatorMemberOptions((members ?? []) as OperatorMemberRow[], teams ?? [], groups ?? []) });
}
