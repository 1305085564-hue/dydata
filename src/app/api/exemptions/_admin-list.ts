import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type ExemptionRequestRow = {
  id: string;
  applicant_user_id: string | null;
  team_id: string | null;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  group_id: string | null;
  team_id: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
};

type GroupRow = {
  id: string;
  name: string | null;
};

export async function loadAdminExemptionList(input: {
  supabase: SupabaseClient;
  statuses: string[];
  limit: number;
}) {
  const { data, error } = await input.supabase
    .from("exemption_request")
    .select("id, applicant_user_id, team_id, exemption_type, start_date, end_date, reason, request_status, reviewed_by, reviewed_at, created_at")
    .in("request_status", input.statuses)
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    return { response: NextResponse.json({ error: error.message || "读取豁免申请列表失败" }, { status: 500 }) };
  }

  const rows = (data ?? []) as ExemptionRequestRow[];
  const applicantIds = Array.from(new Set(rows.map((row) => row.applicant_user_id).filter(Boolean))) as string[];
  const reviewerIds = Array.from(new Set(rows.map((row) => row.reviewed_by).filter(Boolean))) as string[];
  const allProfileIds = Array.from(new Set([...applicantIds, ...reviewerIds]));

  const profilesResult = allProfileIds.length > 0
    ? await input.supabase.from("profiles").select("id, name, group_id, team_id").in("id", allProfileIds)
    : { data: [] as ProfileRow[], error: null };

  if (profilesResult.error) {
    return { response: NextResponse.json({ error: profilesResult.error.message || "读取成员信息失败" }, { status: 500 }) };
  }

  const profiles = ((profilesResult.data ?? []) as ProfileRow[]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const teamIds = Array.from(new Set([
    ...rows.map((row) => row.team_id).filter(Boolean),
    ...profiles.map((profile) => profile.team_id).filter(Boolean),
  ])) as string[];
  const groupIds = Array.from(new Set(profiles.map((profile) => profile.group_id).filter(Boolean))) as string[];

  const teamsResult = teamIds.length > 0
    ? await input.supabase.from("teams").select("id, name").in("id", teamIds)
    : { data: [] as TeamRow[], error: null };
  const groupsResult = groupIds.length > 0
    ? await input.supabase.from("groups").select("id, name").in("id", groupIds)
    : { data: [] as GroupRow[], error: null };

  if (teamsResult.error) {
    return { response: NextResponse.json({ error: teamsResult.error.message || "读取团队信息失败" }, { status: 500 }) };
  }
  if (groupsResult.error) {
    return { response: NextResponse.json({ error: groupsResult.error.message || "读取小组信息失败" }, { status: 500 }) };
  }

  const teamById = new Map(((teamsResult.data ?? []) as TeamRow[]).map((team) => [team.id, team]));
  const groupById = new Map(((groupsResult.data ?? []) as GroupRow[]).map((group) => [group.id, group]));

  return {
    data: rows.map((row) => {
      const applicant = row.applicant_user_id ? profileById.get(row.applicant_user_id) : null;
      const reviewer = row.reviewed_by ? profileById.get(row.reviewed_by) : null;
      const team = row.team_id ? teamById.get(row.team_id) : applicant?.team_id ? teamById.get(applicant.team_id) : null;
      const group = applicant?.group_id ? groupById.get(applicant.group_id) : null;

      return {
        ...row,
        applicant_name: applicant?.name ?? null,
        team_name: team?.name ?? null,
        group_id: applicant?.group_id ?? null,
        group_name: group?.name ?? null,
        reviewed_by_name: reviewer?.name ?? null,
      };
    }),
  };
}
