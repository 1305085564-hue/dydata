import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { formatShanghaiDateOnly, shanghaiDateRangeToUtc, shiftDateOnly } from "@/lib/business-time";
import type {
  CollaborationAccount,
  CollaborationReport,
  CollaborationRoleTab,
  CollaborationVideo,
} from "../domain/types";
import {
  CollaborationNotFoundError,
  STATS_START_DATE,
} from "../domain/types";
import {
  accountMap,
  getSixMonthRanges,
  getCollaborationWorkDate,
  isGrowthRoleMatch,
  roleList,
  selectGrowthReports,
  unique,
} from "../domain/report-rules";
import { buildPersonPayload } from "../domain/person-rules";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import {
  loadVideoSnapshotMetrics,
  loadVideoTopicTags,
} from "./dataset";
import {
  loadAccounts,
  loadOwnedAccounts,
  mapProfileRow,
  queryProfiles,
  queryScopedReports,
} from "./reports";

function reportRangeToUtc(start: string, end: string) {
  return shanghaiDateRangeToUtc(start, end);
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
  evaluationStandards?: EvaluationStandards;
}) {
  const ranges = getSixMonthRanges(input.year, input.month);
  const today = formatShanghaiDateOnly();
  const growthStart = shiftDateOnly(new Date(`${today}T00:00:00.000Z`), -29);
  const isTalentView = input.role === "talents";
  // 达人视角按「账号主人」归属：先查本人名下账号，再按账号精确取日报，不再扫全公司可见日报。
  // 其余岗位的增长窗口仍按署名取数；当月署名统计（currentMonth 等）由 targetUserId 那次查询提供。
  const signedGrowthPromise = input.role && !isTalentView
    ? queryScopedReports({
        supabase: input.supabase,
        visibleUserIds: input.visibleUserIds,
        start: STATS_START_DATE,
        end: today,
        publishedDateRange: { start: growthStart, end: today },
        assignedUserId: input.targetUserId,
      })
    : Promise.resolve<CollaborationReport[]>([]);
  const [profileResult, reportsResult, ownAccounts, signedGrowthReports] = await Promise.all([
    queryProfiles<Record<string, unknown>>((fields) =>
      input.supabase.from("profiles").select(fields).eq("id", input.targetUserId).maybeSingle(),
    ),
    queryScopedReports({
      supabase: input.supabase,
      visibleUserIds: input.visibleUserIds,
      start: STATS_START_DATE,
      end: ranges.at(-1)!.end,
      assignedUserId: input.targetUserId,
      publishedDateRange: { start: ranges[0]!.start, end: ranges.at(-1)!.end },
    }),
    isTalentView
      ? loadOwnedAccounts(input.supabase, input.targetUserId)
      : Promise.resolve<CollaborationAccount[]>([]),
    signedGrowthPromise,
  ]);
  assertSupabaseQuerySucceeded(profileResult.error, "加载个人资料失败");
  if (!profileResult.data) throw new CollaborationNotFoundError("成员不存在");

  const growthReportsResult = isTalentView
    ? await queryScopedReports({
        supabase: input.supabase,
        visibleUserIds: input.visibleUserIds,
        start: STATS_START_DATE,
        end: today,
        publishedDateRange: { start: growthStart, end: today },
        accountIds: ownAccounts.map((account) => account.id),
      })
    : signedGrowthReports;
  const reports = reportsResult;
  const roleReports = reports.filter((row) => roleList(row, input.targetUserId).length > 0);
  const currentRange = ranges.at(-1)!;
  const currentRows = roleReports.filter((row) => {
    const date = getCollaborationWorkDate(row);
    return date >= currentRange.start && date <= currentRange.end;
  });
  const [accounts, videos] = await Promise.all([
    loadAccounts(input.supabase, unique([...roleReports, ...growthReportsResult].map((row) => row.account_id))),
    loadVideosForReports(input.supabase, currentRows),
  ]);
  // 达人明细的作品归属看账号主人，与达人榜单同源（isGrowthRoleMatch/talents）；
  // 账号精确查询已限定在本人名下，仍按同一归属口径复核，防止账号换绑后误收。
  const accountsById = accountMap(accounts);
  const talentRecordRows = isTalentView
    ? growthReportsResult.filter((row) =>
        isGrowthRoleMatch(row, input.targetUserId, "talents", accountsById),
      )
    : undefined;
  // 先按岗位口径收敛，再只为真正入选的作品取 24h 快照：
  // 达人视角已按本人账号精确取数，这里再按 isGrowthRoleMatch 复核，避免账号换绑后把无关作品拉进快照。
  const growthReports = input.role
    ? selectGrowthReports({
        targetUserId: input.targetUserId,
        role: input.role,
        reports: growthReportsResult,
        accounts,
        today,
      })
    : [];
  // 当月作品一并纳入快照取数，播放量整表统一走「平台真实值」，不与日报填报值混用。
  const qualityRows = input.role
    ? [...currentRows, ...(talentRecordRows ?? []), ...growthReports]
    : [];
  // 快照与话题互不依赖，同时读取，避免个人卡首屏被两段网络等待串成瀑布。
  const [growthSnapshots, qualityTopics] = await Promise.all([
    loadVideoSnapshotMetrics(input.supabase, qualityRows),
    input.role === "writers" || input.role === "talents"
      ? loadVideoTopicTags(input.supabase, qualityRows)
      : Promise.resolve(undefined),
  ]);
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
    growthRole: input.role,
    growthReports,
    growthSnapshots,
    currentSnapshots: growthSnapshots,
    recordRows: talentRecordRows,
    qualityTopics,
    evaluationStandards: input.evaluationStandards,
    today,
  });
}
