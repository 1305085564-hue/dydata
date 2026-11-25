import type { SupabaseClient } from "@supabase/supabase-js";
import { asCount, buildSummary, fromStatsStart, isOtherAccount, unique } from "../domain/report-rules";
import { buildContentQualitySummary } from "../domain/quality-rules";
import { buildOperators, buildStaff } from "../domain/role-metrics";
import { buildTalents } from "../domain/aggregates";
import { buildWorkGroupViews } from "../domain/work-group-rules";
import type { MonthRange, CollaborationMonthDataset } from "../domain/types";
import type { CollaborationOverviewStats, OperatorRow, StaffRow, SummaryData, TalentRow, WriterCandidateRow, WorkGroupViews, WorkGroupRow, WorkGroupRosterMember } from "../types";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import { loadCachedCollaborationMonthDataset } from "@/lib/loaders/collaboration-month-cache";
import { loadWriterCandidates } from "@/lib/writer-certifications";
import { loadWorkGroupRoster } from "@/lib/work-groups";

export type CollaborationDataTab = "talents" | "operators" | "writers" | "editors" | "teams" | "person-context";

export interface CollaborationTabCounts {
  talents: number;
  operators: number;
  writers: number;
  editors: number;
  teams: number;
}

export interface CollaborationPersonContext {
  ownAccountIds: string[];
  operatorAccounts: OperatorRow["accounts"];
}

export interface CollaborationWorkbenchData {
  tab: CollaborationDataTab;
  counts: CollaborationTabCounts;
  summary: SummaryData;
  overviewStats: CollaborationOverviewStats;
  evaluationStandards: EvaluationStandards;
  talents: TalentRow[];
  operators: OperatorRow[];
  writerStaff: StaffRow[];
  editorStaff: StaffRow[];
  writerCandidates: WriterCandidateRow[];
  workGroupViews?: WorkGroupViews;
  workGroupRawGroups?: WorkGroupRow[];
  workGroupRoster?: WorkGroupRosterMember[];
  personContext?: CollaborationPersonContext;
}

export async function loadCollaborationWorkbenchData(input: {
  supabase: SupabaseClient;
  range: MonthRange;
  tab: CollaborationDataTab;
  visibleUserIds: string[];
  activeVisibleUserIds: string[];
  restrictToSelf: boolean;
  userId: string;
  teamId: string | null;
  scopeKey: string;
  standards: EvaluationStandards;
  canLoadWriterCandidates: boolean;
  actor: { userId: string; companyRole?: "company_owner" | "admin" | "member" | null };
  personId?: string | null;
  fresh?: boolean;
}): Promise<CollaborationWorkbenchData> {
  const workGroupTeamIds = input.teamId ? [input.teamId] : [];
  const dataset = await loadCachedCollaborationMonthDataset({
    supabase: input.supabase,
    visibleUserIds: input.visibleUserIds,
    range: input.range,
    monthOnly: true,
    includeWriterCertifications: true,
    includeWorkGroupRoster: false,
    workGroupTeamIds,
    cacheScopeKey: input.scopeKey,
    fresh: input.fresh,
  });
  let tabDataset = dataset;
  if (input.tab === "teams" && dataset.workGroups?.ready && dataset.workGroups.groups.length > 0) {
    const roster = await loadWorkGroupRoster(input.supabase, { teamIds: workGroupTeamIds });
    tabDataset = {
      ...dataset,
      workGroups: roster.ready
        ? { ...dataset.workGroups, roster: roster.roster }
        : { ready: false, groups: [], roster: [] },
    };
  }
  return buildCollaborationWorkbenchData({ ...input, dataset: tabDataset });
}

export async function buildCollaborationWorkbenchData(input: {
  dataset: CollaborationMonthDataset;
  supabase?: SupabaseClient;
  writerCandidateLoader?: typeof loadWriterCandidates;
  range: MonthRange;
  tab: CollaborationDataTab;
  visibleUserIds: string[];
  activeVisibleUserIds: string[];
  restrictToSelf: boolean;
  userId: string;
  teamId: string | null;
  standards: EvaluationStandards;
  canLoadWriterCandidates: boolean;
  actor: { userId: string; companyRole?: "company_owner" | "admin" | "member" | null };
  personId?: string | null;
}) {
  const dataset = input.dataset;
  const rows = fromStatsStart(dataset.currentRows);
  const snapshots = dataset.videoSnapshots ?? new Map();
  const topicContext = dataset.videoTopicTags ?? { state: "error" as const, tags: new Map() };
  const accountsById = new Map(dataset.accounts.map((account) => [account.id, account]));
  const targetUser = (userId: string) => !input.restrictToSelf || userId === input.userId;

  const withinScope = (id: string | null | undefined): id is string => Boolean(id && targetUser(id));
  const talentIds = unique(rows.map((row) => accountsById.get(row.account_id)?.profile_id).filter(withinScope));
  const operatorIds = unique(rows.filter((row) => row.operator_user_id && isOtherAccount(accountsById.get(row.account_id), row.operator_user_id)).map((row) => row.operator_user_id).filter(withinScope));
  const writerIds = unique([
    ...rows.map((row) => row.script_author_user_id),
    ...(dataset.writerCertifications ?? []).filter((item) => item.certified).map((item) => item.userId),
  ].filter(withinScope));
  const editorIds = unique(rows.filter((row) => row.video_editor_user_id && isOtherAccount(accountsById.get(row.account_id), row.video_editor_user_id)).map((row) => row.video_editor_user_id).filter(withinScope));
  const counts: CollaborationTabCounts = {
    talents: talentIds.length,
    operators: operatorIds.length,
    writers: writerIds.length,
    editors: editorIds.length,
    teams: dataset.workGroups?.groups.length ?? 0,
  };

  const summary = buildSummary(dataset.currentRows) as SummaryData;
  const totalPlay = rows.reduce((sum, row) => sum + asCount(row.play_count), 0);
  const quality = topicContext.state === "ready"
    ? buildContentQualitySummary(rows, snapshots, topicContext, input.standards)
    : null;
  const overviewStats: CollaborationOverviewStats = {
    month: input.range.month,
    total: summary.total,
    totalPlay,
    goodExcellentRate: quality && quality.ratedCount > 0 ? quality.goodExcellentRate : null,
    restrictToSelf: input.restrictToSelf,
  };

  const result: CollaborationWorkbenchData = {
    tab: input.tab,
    counts,
    summary,
    overviewStats,
    evaluationStandards: input.standards,
    talents: [],
    operators: [],
    writerStaff: [],
    editorStaff: [],
    writerCandidates: [],
  };

  if (input.tab === "talents" || input.tab === "person-context") {
    result.talents = buildTalents(dataset.currentRows, dataset.profiles, dataset.accounts, snapshots, topicContext, input.standards)
      .filter((row) => targetUser(row.userId));
  }
  if (input.tab === "operators" || input.tab === "person-context") {
    result.operators = buildOperators(dataset.currentRows, dataset.profiles, dataset.accounts, snapshots)
      .filter((row) => targetUser(row.userId));
  }
  if (input.tab === "writers") {
    const writerList = buildStaff(dataset.currentRows, "writer", dataset.profiles, dataset.accounts, dataset.writerCertifications, snapshots, topicContext, input.standards)
      .filter((row) => targetUser(row.userId));
    let candidates: WriterCandidateRow[] = [];
    if (input.canLoadWriterCandidates && input.supabase) {
      candidates = await (input.writerCandidateLoader ?? loadWriterCandidates)({
        supabase: input.supabase,
        activeVisibleUserIds: input.activeVisibleUserIds,
        actor: input.actor,
      }).catch(() => []);
    }
    const rowsByUserId = new Map(writerList.map((row) => [row.userId, row]));
    result.writerStaff = writerList;
    result.writerCandidates = candidates.map((candidate) => {
      const existing = rowsByUserId.get(candidate.userId);
      if (existing?.writerQuality) return { ...candidate, writerQuality: existing.writerQuality };
      return {
        ...candidate,
        writerQuality: {
          state: topicContext.state,
          summary: topicContext.state === "ready"
            ? buildContentQualitySummary([], snapshots, topicContext, input.standards)
            : null,
        },
      };
    });
  }
  if (input.tab === "editors") {
    result.editorStaff = buildStaff(dataset.currentRows, "editor", dataset.profiles, dataset.accounts, [], snapshots)
      .filter((row) => targetUser(row.userId));
  }
  if (input.tab === "teams") {
    result.workGroupViews = buildWorkGroupViews(dataset, input.standards);
    result.workGroupRawGroups = dataset.workGroups?.groups ?? [];
    result.workGroupRoster = dataset.workGroups?.roster ?? [];
  }
  if (input.tab === "person-context" && input.personId) {
    result.personContext = {
      ownAccountIds: result.talents.find((row) => row.userId === input.personId)?.accounts.map((account) => account.accountId) ?? [],
      operatorAccounts: result.operators.find((row) => row.userId === input.personId)?.accounts ?? [],
    };
  }
  return result;
}
