import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";
import type {
  CollaborationReport,
  CollaborationRoleTab,
  CollaborationVideo,
} from "../domain/types";
import {
  CollaborationNotFoundError,
  STATS_START_DATE,
} from "../domain/types";
import {
  getSixMonthRanges,
  getCollaborationWorkDate,
  roleList,
  selectGrowthReports,
  unique,
} from "../domain/report-rules";
import { buildPersonPayload } from "../domain/person-rules";
import {
  loadVideoSnapshotMetrics,
  loadVideoTopicTags,
} from "./dataset";
import {
  loadAccounts,
  mapProfileRow,
  queryProfiles,
  queryScopedReports,
} from "./reports";

function reportRangeToUtc(start: string, end: string) {
  const startUtc = new Date(`${start}T00:00:00+08:00`).toISOString();
  const endDate = new Date(`${end}T00:00:00+08:00`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return { startUtc, endUtc: endDate.toISOString() };
}

async function loadVideosForReports(supabase: SupabaseClient, rows: CollaborationReport[]) {
  if (rows.length === 0) return [];
  const dates = rows.flatMap((row) => [row.report_date, getCollaborationWorkDate(row)]).sort();
  const { startUtc, endUtc } = reportRangeToUtc(dates[0]!, dates.at(-1)!);
  const result = await supabase
    .from("videos")
    .select("id, account_id, video_title, published_at, uploaded_at, anomaly_status")
    .in("account_id", unique(rows.map((row) => row.account_id)))
    .eq("lifecycle_state", "active")
    .or(
      `and(published_at.gte.${startUtc},published_at.lt.${endUtc}),and(uploaded_at.gte.${startUtc},uploaded_at.lt.${endUtc})`,
    )
    .order("uploaded_at", { ascending: false });
  assertSupabaseQuerySucceeded(result.error, "加载视频异常状态失败");
  return (result.data ?? []) as CollaborationVideo[];
}

export async function loadPersonData(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  targetUserId: string;
  year: number;
  month: number;
  role?: CollaborationRoleTab;
}) {
  const ranges = getSixMonthRanges(input.year, input.month);
  const today = formatShanghaiDateOnly();
  const growthStart = shiftDateOnly(new Date(`${today}T00:00:00.000Z`), -29);
  // 达人的作品归属由账号主人决定，只有增长窗口需要放开岗位字段预过滤；
  // 当月档案口径仍按署名取（buildPersonPayload 只认 roleList，多取会被丢弃）。
  const [profileResult, reportsResult, growthReportsResult] = await Promise.all([
    queryProfiles<Record<string, unknown>>((fields) =>
      input.supabase.from("profiles").select(fields).eq("id", input.targetUserId).maybeSingle(),
    ),
    queryScopedReports({
      supabase: input.supabase,
      visibleUserIds: input.visibleUserIds,
      start: STATS_START_DATE,
      end: ranges.at(-1)!.end,
      assignedUserId: input.targetUserId,
    }),
    input.role
      ? queryScopedReports({
          supabase: input.supabase,
          visibleUserIds: input.visibleUserIds,
          start: STATS_START_DATE,
          end: today,
          publishedDateRange: { start: growthStart, end: today },
          assignedUserId: input.role === "talents" ? undefined : input.targetUserId,
        })
      : Promise.resolve([]),
  ]);
  assertSupabaseQuerySucceeded(profileResult.error, "加载个人资料失败");
  if (!profileResult.data) throw new CollaborationNotFoundError("成员不存在");

  const reports = reportsResult;
  const roleReports = reports.filter((row) => roleList(row, input.targetUserId).length > 0);
  const currentRange = ranges.at(-1)!;
  const currentRows = roleReports.filter(
    (row) => row.report_date >= currentRange.start && row.report_date <= currentRange.end,
  );
  const [accounts, videos] = await Promise.all([
    loadAccounts(input.supabase, unique([...roleReports, ...growthReportsResult].map((row) => row.account_id))),
    loadVideosForReports(input.supabase, currentRows),
  ]);
  // 先按岗位口径收敛，再只为真正入选的作品取 24h 快照：达人视角的日报是全公司范围，
  // 不先过滤会把几百个无关视频的快照一并拉回来（每 100 个一批）。
  const growthReports = input.role
    ? selectGrowthReports({
        targetUserId: input.targetUserId,
        role: input.role,
        reports: growthReportsResult,
        accounts,
        today,
      })
    : [];
  const qualityRows = input.role === "writers"
    ? [...currentRows, ...growthReports]
    : growthReports;
  const growthSnapshots = await loadVideoSnapshotMetrics(input.supabase, qualityRows);
  const qualityTopics = input.role === "writers"
    ? await loadVideoTopicTags(input.supabase, qualityRows)
    : undefined;
  const profile = mapProfileRow(profileResult.data);

  return buildPersonPayload({
    targetUserId: input.targetUserId,
    year: input.year,
    month: input.month,
    reports: roleReports,
    profile,
    profiles: [profile],
    accounts,
    videos,
    historyRows: reports,
    growthRole: input.role,
    growthReports,
    growthSnapshots,
    currentSnapshots: growthSnapshots,
    qualityTopics,
    today,
  });
}
