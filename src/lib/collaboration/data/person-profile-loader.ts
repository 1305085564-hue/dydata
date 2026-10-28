import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { isWorkGroupSchemaMissing, loadWorkGroupDirectory } from "@/lib/work-groups";
import {
  buildMonthSummary,
  buildMonthlyTrend,
  buildPersonProfileWorks,
  buildRecentAnomalies,
  buildStrengths,
  buildTopWorks,
  derivePersonRoles,
  type PersonMonthSummary,
  type PersonMonthTrendRow,
  type PersonProfileRole,
  type PersonProfileWork,
  type PersonStrengthRow,
} from "../domain/person-profile-rules";
import {
  getCollaborationWorkDate,
  getSixMonthRanges,
  unique,
} from "../domain/report-rules";
import type { CollaborationAccount, CollaborationReport } from "../domain/types";
import { STATS_START_DATE } from "../domain/types";
import { loadVideoSnapshotMetrics, loadVideoTopicTags } from "./dataset";
import { loadAccounts, queryScopedReports } from "./reports";

/** PostgREST `.in()` 走查询串，批次过大有 URL 长度风险（与 dataset.ts 同款约束）。 */
const ID_BATCH_SIZE = 100;

export type PersonProfileData = {
  person: {
    userId: string;
    name: string;
    teamName: string | null;
    /** 工种小队名；小队未上线或无归属时为空数组（页面只显示团队名）。 */
    workGroupNames: string[];
    membershipStatus: string | null;
    roles: Record<PersonProfileRole, boolean>;
  };
  monthSummary: PersonMonthSummary;
  trend: PersonMonthTrendRow[];
  strengths: PersonStrengthRow[];
  topWorks: PersonProfileWork[];
  anomalies: PersonProfileWork[];
};

type ProfileRow = {
  id: string;
  name: string | null;
  team_id: string | null;
  membership_status: string | null;
  work_peer_group_id?: string | null;
  work_operator_group_id?: string | null;
};

const PROFILE_FIELDS = "id, name, team_id, membership_status";
const PROFILE_FIELDS_WITH_WORK_GROUPS = `${PROFILE_FIELDS}, work_peer_group_id, work_operator_group_id`;

/** 带小队归属的读列；库还没跑 work_groups migration 时退回首列，不把整页打挂。 */
async function loadProfileRow(supabase: SupabaseClient, targetUserId: string) {
  const primary = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS_WITH_WORK_GROUPS)
    .eq("id", targetUserId)
    .maybeSingle();
  if (!primary.error || !isWorkGroupSchemaMissing(primary.error)) {
    assertSupabaseQuerySucceeded(primary.error, "加载成员资料失败");
    return (primary.data as unknown as ProfileRow | null) ?? null;
  }
  const fallback = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", targetUserId)
    .maybeSingle();
  assertSupabaseQuerySucceeded(fallback.error, "加载成员资料失败");
  return (fallback.data as unknown as ProfileRow | null) ?? null;
}

function batchesOf(ids: string[]): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += ID_BATCH_SIZE) {
    batches.push(ids.slice(index, index + ID_BATCH_SIZE));
  }
  return batches;
}

/** 题材标签（擅长什么用）：每视频取第一条非空，参考 dataset.ts 话题标签的批量写法。 */
async function loadVideoSubjectTags(
  supabase: SupabaseClient,
  rows: CollaborationReport[],
): Promise<Map<string, string | null>> {
  const videoIds = unique(rows.map((row) => row.video_id));
  const tags = new Map<string, string | null>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  if (videoIds.length === 0) return tags;
  const results = await Promise.all(
    batchesOf(videoIds).map((batch) =>
      supabase
        .from("video_tags")
        .select("video_id, tag_value")
        .eq("tag_dimension", "题材")
        .in("video_id", batch)
        .then((result) => {
          assertSupabaseQuerySucceeded(result.error, "读取视频题材标签失败");
          return (result.data ?? []) as Array<{ video_id: string; tag_value: string | null }>;
        }),
    ),
  );
  for (const tag of results.flat()) {
    if (tag.video_id && tag.tag_value && !tags.has(tag.video_id)) tags.set(tag.video_id, tag.tag_value);
  }
  return tags;
}

/** 异常状态：只认 video_id 精确匹配，不做标题/日期三元兜底。 */
async function loadVideoAnomalyStatuses(
  supabase: SupabaseClient,
  rows: CollaborationReport[],
): Promise<Map<string, string | null>> {
  const videoIds = unique(rows.map((row) => row.video_id));
  const anomalies = new Map<string, string | null>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  if (videoIds.length === 0) return anomalies;
  const results = await Promise.all(
    batchesOf(videoIds).map((batch) =>
      supabase
        .from("videos")
        .select("id, anomaly_status")
        .in("id", batch)
        .then((result) => {
          assertSupabaseQuerySucceeded(result.error, "读取视频异常状态失败");
          return (result.data ?? []) as Array<{ id: string; anomaly_status: string | null }>;
        }),
    ),
  );
  for (const video of results.flat()) anomalies.set(video.id, video.anomaly_status ?? null);
  return anomalies;
}

/**
 * 成员主页取数：6 个月窗口（今天所在月往前 5 个月的 1 号 ~ 今天）内，
 * 署名岗位（Query A）与达人岗位（Query B，名下账号）两路取日报后按 report id 去重合并，
 * 作品日期统一走 getCollaborationWorkDate。返回 null = 成员不存在。
 * 播放与评级只认平台 24h 快照，快照缺失即 null/不评级，绝不回落日报 play_count。
 */
export async function loadPersonProfileData(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  targetUserId: string;
  today: string;
  evaluationStandards?: EvaluationStandards;
}): Promise<PersonProfileData | null> {
  const { supabase, visibleUserIds, targetUserId, today } = input;
  const [profile, ownAccountsResult] = await Promise.all([
    loadProfileRow(supabase, targetUserId),
    supabase
      .from("accounts")
      .select("id, name, profile_id")
      .eq("profile_id", targetUserId)
      .then((result) => {
        assertSupabaseQuerySucceeded(result.error, "加载成员账号失败");
        return (result.data ?? []) as CollaborationAccount[];
      }),
  ]);
  if (!profile) return null;
  const ownAccounts = ownAccountsResult;

  const ranges = getSixMonthRanges(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const windowStart = ranges[0]!.start;
  const currentRange = ranges[ranges.length - 1]!;

  const teamNamePromise = profile.team_id
    ? supabase
        .from("teams")
        .select("id, name")
        .eq("id", profile.team_id)
        .maybeSingle()
        .then((result) => {
          assertSupabaseQuerySucceeded(result.error, "加载团队失败");
          return ((result.data as { name?: string | null } | null)?.name ?? null);
        })
    : Promise.resolve(null);
  const workGroupsPromise = profile.team_id
    ? loadWorkGroupDirectory(supabase, { teamIds: [profile.team_id] })
    : Promise.resolve(null);

  const [signedRows, talentRows] = await Promise.all([
    queryScopedReports({
      supabase,
      visibleUserIds,
      start: STATS_START_DATE,
      end: today,
      publishedDateRange: { start: windowStart, end: today },
      assignedUserId: targetUserId,
    }),
    queryScopedReports({
      supabase,
      visibleUserIds,
      start: STATS_START_DATE,
      end: today,
      publishedDateRange: { start: windowStart, end: today },
      accountIds: ownAccounts.map((account) => account.id),
    }),
  ]);
  const rowsById = new Map<string, CollaborationReport>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const row of [...signedRows, ...talentRows]) rowsById.set(row.id, row);
  const rows = Array.from(rowsById.values()).filter((row) => {
    const date = getCollaborationWorkDate(row);
    return date >= windowStart && date <= today;
  });

  const [accounts, snapshots, topics, subjects, anomalies, teamName, workGroups] = await Promise.all([
    loadAccounts(supabase, unique(rows.map((row) => row.account_id))),
    loadVideoSnapshotMetrics(supabase, rows),
    loadVideoTopicTags(supabase, rows),
    loadVideoSubjectTags(supabase, rows),
    loadVideoAnomalyStatuses(supabase, rows),
    teamNamePromise,
    workGroupsPromise,
  ]);

  const works = buildPersonProfileWorks({
    targetUserId,
    rows,
    accounts,
    snapshots,
    topics,
    subjects,
    anomalies,
    evaluationStandards: input.evaluationStandards,
  });
  const monthWorks = works.filter(
    (work) => work.workDate >= currentRange.start && work.workDate <= currentRange.end,
  );
  const workGroupNames = workGroups
    ? workGroups.groups
        .filter(
          (group) => group.id === profile.work_peer_group_id || group.id === profile.work_operator_group_id,
        )
        .map((group) => group.name)
    : [];

  return {
    person: {
      userId: targetUserId,
      name: profile.name?.trim() || "未命名成员",
      teamName,
      workGroupNames,
      membershipStatus: profile.membership_status ?? null,
      roles: derivePersonRoles(works),
    },
    monthSummary: buildMonthSummary(monthWorks, rows, snapshots),
    trend: buildMonthlyTrend(works, today),
    strengths: buildStrengths(works),
    topWorks: buildTopWorks(works, 5),
    anomalies: buildRecentAnomalies(works),
  };
}
