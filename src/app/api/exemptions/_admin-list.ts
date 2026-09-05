import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type ExemptionRequestRow = {
  id: string;
  applicant_user_id: string | null;
  team_id: string | null;
  exemption_type: string;
  exemption_category: string | null;
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
  team_id: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
};

function databaseFailure(context: string, error: unknown) {
  console.error(`[exemptions] ${context}`, error);
  return { response: NextResponse.json({ error: context }, { status: 500 }) };
}

export async function loadAdminExemptionList(input: {
  supabase: SupabaseClient;
  statuses: string[];
  limit: number;
  visibleUserIds: string[] | null;
}) {
  let query = input.supabase
    .from("exemption_request")
    .select("id, applicant_user_id, team_id, exemption_type, exemption_category, start_date, end_date, reason, request_status, reviewed_by, reviewed_at, created_at");
  if (input.visibleUserIds !== null) {
    query = query.in("applicant_user_id", input.visibleUserIds);
  }

  const { data, error } = await query
    .in("request_status", input.statuses)
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    return databaseFailure("读取豁免申请列表失败", error);
  }

  const rows = (data ?? []) as ExemptionRequestRow[];
  const requestIds = rows.map((row) => row.id);
  const datesResult = requestIds.length > 0
    ? await input.supabase.from("exemption_request_date").select("id, request_id, request_date, reason, status, feedback, reviewed_by, reviewed_at").in("request_id", requestIds)
    : { data: [], error: null };
  if (datesResult.error) return databaseFailure("读取申请日期明细失败", datesResult.error);
  const datesByRequest = new Map<string, Array<Record<string, unknown>>>();
  for (const date of (datesResult.data ?? []) as Array<Record<string, unknown> & { request_id: string }>) {
    const list = datesByRequest.get(date.request_id) ?? [];
    list.push(date);
    datesByRequest.set(date.request_id, list);
  }
  const applicantIds = Array.from(new Set(rows.map((row) => row.applicant_user_id).filter(Boolean))) as string[];
  const reviewerIds = Array.from(new Set(rows.map((row) => row.reviewed_by).filter(Boolean))) as string[];
  const allProfileIds = Array.from(new Set([...applicantIds, ...reviewerIds]));

  const profilesResult = allProfileIds.length > 0
    ? await input.supabase.from("profiles").select("id, name, team_id").in("id", allProfileIds)
    : { data: [] as ProfileRow[], error: null };

  if (profilesResult.error) {
    return databaseFailure("读取成员信息失败", profilesResult.error);
  }

  const profiles = ((profilesResult.data ?? []) as ProfileRow[]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const teamIds = Array.from(new Set([
    ...rows.map((row) => row.team_id).filter(Boolean),
    ...profiles.map((profile) => profile.team_id).filter(Boolean),
  ])) as string[];
  const teamsResult = teamIds.length > 0
    ? await input.supabase.from("teams").select("id, name").in("id", teamIds)
    : { data: [] as TeamRow[], error: null };

  if (teamsResult.error) {
    return databaseFailure("读取团队信息失败", teamsResult.error);
  }

  const teamById = new Map(((teamsResult.data ?? []) as TeamRow[]).map((team) => [team.id, team]));

  // 决策透视舱：轻量聚合申请人当月（自然月）已获批准的请假与免交天数
  const applicantMonthStatsMap = new Map<string, { approved_leave_days: number; approved_waived_days: number }>();
  if (applicantIds.length > 0) {
    const shanghaiToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const currentMonthPrefix = shanghaiToday.slice(0, 7); // YYYY-MM
    const currentMonthStart = `${currentMonthPrefix}-01`;
    const yearNum = Number(currentMonthPrefix.slice(0, 4));
    const monthNum = Number(currentMonthPrefix.slice(5, 7));
    const nextMonthStart = monthNum === 12
      ? `${yearNum + 1}-01-01`
      : `${yearNum}-${String(monthNum + 1).padStart(2, "0")}-01`;

    let grantsResult: { data?: unknown; error?: unknown } | null = null;
    try {
      grantsResult = await (input.supabase
        .from("exemption_grant")
        .select("user_id, start_date, end_date, grant_type, exemption_category, status")
        .in("user_id", applicantIds)
        .eq("status", "active")
        .or(`grant_type.eq.permanent,and(start_date.lt.${nextMonthStart},or(end_date.is.null,end_date.gte.${currentMonthStart}))`) as unknown as Promise<{ data?: unknown; error?: unknown }>);
    } catch (err) {
      console.error("[exemptions] 当月出勤统计失败", err);
    }

    if (grantsResult?.error) {
      console.error("[exemptions] 当月出勤统计失败", grantsResult.error);
    } else if (grantsResult && Array.isArray(grantsResult.data)) {
      type GrantRow = {
        user_id: string;
        start_date: string | null;
        end_date: string | null;
        grant_type: string | null;
        exemption_category: string | null;
      };
      const grantsByUser = new Map<string, GrantRow[]>();
      for (const g of grantsResult.data as GrantRow[]) {
        if (!g.user_id) continue;
        const list = grantsByUser.get(g.user_id) ?? [];
        list.push(g);
        grantsByUser.set(g.user_id, list);
      }

      // 获取当月最后一天的数字，计算交集天数
      const daysInCurrentMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
      const currentMonthEnd = `${currentMonthPrefix}-${String(daysInCurrentMonth).padStart(2, "0")}`;

      for (const uid of applicantIds) {
        const userGrants = grantsByUser.get(uid) ?? [];
        const leaveDates = new Set<string>();
        const waivedDates = new Set<string>();

        for (const g of userGrants) {
          const cat = g.exemption_category === "leave" ? "leave" : "waive";
          const isPerm = g.grant_type === "permanent";
          const start = isPerm || !g.start_date || g.start_date < currentMonthStart ? currentMonthStart : g.start_date;
          const end = isPerm || !g.end_date || g.end_date > currentMonthEnd ? currentMonthEnd : g.end_date;

          if (start <= end) {
            const startDay = Number(start.slice(8, 10));
            const endDay = Number(end.slice(8, 10));
            for (let d = startDay; d <= endDay; d++) {
              const dayKey = `${currentMonthPrefix}-${String(d).padStart(2, "0")}`;
              if (cat === "leave") {
                leaveDates.add(dayKey);
              } else {
                waivedDates.add(dayKey);
              }
            }
          }
        }

        applicantMonthStatsMap.set(uid, {
          approved_leave_days: leaveDates.size,
          approved_waived_days: waivedDates.size,
        });
      }
    }
  }

  return {
    data: rows.map((row) => {
      const applicant = row.applicant_user_id ? profileById.get(row.applicant_user_id) : null;
      const reviewer = row.reviewed_by ? profileById.get(row.reviewed_by) : null;
      const team = row.team_id ? teamById.get(row.team_id) : applicant?.team_id ? teamById.get(applicant.team_id) : null;
      const monthStats = row.applicant_user_id ? applicantMonthStatsMap.get(row.applicant_user_id) : undefined;

      return {
        ...row,
        applicant_name: applicant?.name ?? null,
        team_name: team?.name ?? null,
        group_id: null,
        group_name: null,
        reviewed_by_name: reviewer?.name ?? null,
        daily_items: datesByRequest.get(row.id) ?? [],
        ...(monthStats ? { applicant_month_stats: monthStats } : {}),
      };
    }),
  };
}
