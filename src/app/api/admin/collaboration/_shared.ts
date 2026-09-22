import type { SupabaseClient } from "@supabase/supabase-js";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import { filterActiveMemberships, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

import { loadWriterCertifications } from "@/lib/writer-certifications";
import {
  isWorkGroupSchemaMissing,
  loadWorkGroupDirectory,
  workGroupSlotForKind,
  type WorkGroupDirectory,
  type WorkGroupKind,
  type WorkGroupRosterMember,
  type WorkGroupRow,
} from "@/lib/work-groups";
import { countWorkQuality } from "./quality-counts";

export type WriterEligibility = { userId: string; certified: boolean; certifiedByName: string | null };

export const STATS_START_DATE = "2026-07-27";

const DAILY_REPORT_FIELDS = [
  "id",
  "user_id",
  "report_date",
  "account_id",
  "video_id",
  "title",
  "play_count",
  "data_source",
  "follower_convert",
  "script_author_user_id",
  "video_editor_user_id",
  "operator_user_id",
].join(", ");
const DAILY_REPORT_FIELDS_BEFORE_DATA_SOURCE = DAILY_REPORT_FIELDS.replace(", data_source", "");

// Supabase/PostgREST 默认单次最多返回 1000 行；岗位历史样本不能因为超过上限而静默丢失。
const REPORT_PAGE_SIZE = 1000;

export type CollaborationRole = "writer" | "editor" | "operator";

export type CollaborationReport = {
  id: string;
  user_id: string;
  report_date: string;
  account_id: string;
  video_id: string | null;
  title: string;
  play_count: number | null;
  data_source?: "ai" | "manual" | null;
  follower_convert: number | null;
  script_author_user_id: string | null;
  video_editor_user_id: string | null;
  operator_user_id: string | null;
};

export type CollaborationProfile = {
  id: string;
  name: string | null;
  team_id: string | null;
  /** 工种小队归属（文案/达人二选一，运营可兼任）；与 `work_groups` 同源，仅用于展示分组，不参与权限。 */
  work_peer_group_id?: string | null;
  work_operator_group_id?: string | null;
};

const PROFILE_FIELDS = "id, name, team_id";
/** 带小队归属的读列；库还没跑 work_groups migration 时由 queryProfiles 退回 PROFILE_FIELDS。 */
const PROFILE_FIELDS_WITH_WORK_GROUPS = `${PROFILE_FIELDS}, work_peer_group_id, work_operator_group_id`;

type ProfileQueryError = { message?: string; code?: string } | null;

function mapProfileRow(row: Record<string, unknown>): CollaborationProfile {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    team_id: (row.team_id as string | null) ?? null,
    work_peer_group_id: (row.work_peer_group_id as string | null) ?? null,
    work_operator_group_id: (row.work_operator_group_id as string | null) ?? null,
  };
}

/**
 * 读成员资料：优先带小队归属列，应用先于数据库部署时退回首列，不把整页打挂。
 * 降级只针对「新列不存在」，真正的查询故障仍按 error 原样交给调用方断言（禁止伪装成空数据）。
 * 动态 select 字符串让 PostgREST 的泛型退化成 GenericStringError，这里按行形状收口。
 */
async function queryProfiles<T>(
  run: (fields: string) => PromiseLike<unknown>,
): Promise<{ data: T | null; error: ProfileQueryError }> {
  const primary = (await run(PROFILE_FIELDS_WITH_WORK_GROUPS)) as {
    data: T | null;
    error: ProfileQueryError;
  };
  if (!primary.error || !isWorkGroupSchemaMissing(primary.error)) return primary;
  return (await run(PROFILE_FIELDS)) as { data: T | null; error: ProfileQueryError };
}

export type CollaborationAccount = {
  id: string;
  name: string | null;
  profile_id: string | null;
};

export type CollaborationVideo = {
  id: string;
  account_id: string;
  video_title: string | null;
  published_at: string | null;
  uploaded_at: string | null;
  anomaly_status: string | null;
};

export type MonthRange = {
  year: number;
  month: number;
  start: string;
  end: string;
};

export type AttributionPayload = {
  reportId: string;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
};

export type AttributionReport = Pick<CollaborationReport, "id" | "user_id" | "account_id" | "report_date">;

export class CollaborationNotFoundError extends Error {}

function asCount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function hasPlayCount(row: CollaborationReport) {
  return Number.isFinite(row.play_count);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function profileNameMap(profiles: CollaborationProfile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile.name?.trim() || "未命名成员"]));
}

function accountMap(accounts: CollaborationAccount[]) {
  return new Map(accounts.map((account) => [account.id, account]));
}

function isSelfHandled(row: CollaborationReport) {
  return (
    row.script_author_user_id === row.user_id &&
    row.video_editor_user_id === row.user_id &&
    row.operator_user_id === row.user_id
  );
}

function fromStatsStart(rows: CollaborationReport[]) {
  return rows.filter((row) => row.report_date >= STATS_START_DATE);
}

function roleUserId(row: CollaborationReport, role: "writer" | "editor") {
  return role === "writer" ? row.script_author_user_id : row.video_editor_user_id;
}

function isOtherAccount(account: CollaborationAccount | undefined, userId: string) {
  // 账号未绑定主人时无法证明是自己的，按别人的账号计入，避免漏掉真服务岗
  return !account?.profile_id || account.profile_id !== userId;
}

function roleList(row: CollaborationReport, targetUserId: string): CollaborationRole[] {
  const roles: CollaborationRole[] = [];
  if (row.script_author_user_id === targetUserId) roles.push("writer");
  if (row.video_editor_user_id === targetUserId) roles.push("editor");
  if (row.operator_user_id === targetUserId) roles.push("operator");
  return roles;
}

export function getMonthRange(year: number, month: number): MonthRange | null {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return { year, month, start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

export function getPreviousMonthRange(year: number, month: number) {
  const date = new Date(Date.UTC(year, month - 2, 1));
  return getMonthRange(date.getUTCFullYear(), date.getUTCMonth() + 1)!;
}

export function getSixMonthRanges(year: number, month: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    return getMonthRange(date.getUTCFullYear(), date.getUTCMonth() + 1)!;
  });
}

export function parseMonthParams(searchParams: URLSearchParams) {
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const range = getMonthRange(year, month);
  return range ? { ok: true as const, range } : { ok: false as const, error: "year 或 month 参数不正确" };
}

export function buildSummary(rows: CollaborationReport[]) {
  const scopedRows = fromStatsStart(rows);

  return {
    total: scopedRows.length,
    attributed: scopedRows.filter(
      (row) => row.script_author_user_id && row.video_editor_user_id && row.operator_user_id,
    ).length,
    selfHandled: scopedRows.filter(isSelfHandled).length,
    unattributed: scopedRows.filter(
      (row) => !row.script_author_user_id || !row.video_editor_user_id || !row.operator_user_id,
    ).length,
  };
}

export function buildUnattributedReports(
  currentRows: CollaborationReport[],
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
) {
  const names = profileNameMap(profiles);
  const accMap = accountMap(accounts);
  const scopedRows = fromStatsStart(currentRows);
  const unattributed = scopedRows.filter(
    (row) => !row.script_author_user_id || !row.video_editor_user_id || !row.operator_user_id,
  );

  return unattributed.map((row) => ({
    reportId: row.id,
    reportDate: row.report_date,
    accountId: row.account_id,
    accountName: accMap.get(row.account_id)?.name || "未知账号",
    title: row.title || "未命名作品",
    playCount: asCount(row.play_count),
    creatorUserId: row.user_id,
    creatorName: names.get(row.user_id) || "未命名成员",
    scriptAuthorUserId: row.script_author_user_id,
    scriptAuthorName: row.script_author_user_id ? names.get(row.script_author_user_id) ?? null : null,
    videoEditorUserId: row.video_editor_user_id,
    videoEditorName: row.video_editor_user_id ? names.get(row.video_editor_user_id) ?? null : null,
    operatorUserId: row.operator_user_id,
    operatorName: row.operator_user_id ? names.get(row.operator_user_id) ?? null : null,
  }));
}

function countHits(rows: CollaborationReport[], historyRows = rows): number {
  const byAccount = new Map<string, CollaborationReport[]>();
  for (const row of historyRows.filter(hasPlayCount)) {
    const bucket = byAccount.get(row.account_id) ?? [];
    bucket.push(row);
    byAccount.set(row.account_id, bucket);
  }

  let hits = 0;
  for (const row of rows.filter(hasPlayCount)) {
    const play = asCount(row.play_count);
    if (play < 30000) continue;
    const prior = (byAccount.get(row.account_id) ?? [])
      .filter((candidate) => candidate.id !== row.id && (
        candidate.report_date < row.report_date
        || (candidate.report_date === row.report_date && candidate.id < row.id)
      ))
      .sort((a, b) => b.report_date.localeCompare(a.report_date) || b.id.localeCompare(a.id))
      .slice(0, 5);
    if (prior.length < 3) continue;
    const priorMean = prior.reduce((sum, candidate) => sum + asCount(candidate.play_count), 0) / prior.length;
    if (priorMean > 0 && play >= priorMean * 3) hits++;
  }
  return hits;
}

function monthOverMonth(currentTotal: number, previousRows: CollaborationReport[]) {
  if (previousRows.length === 0) return null;
  const previousTotal = previousRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
  if (previousTotal <= 0) return null;
  return (currentTotal - previousTotal) / previousTotal;
}

export function buildOperators(
  currentRows: CollaborationReport[],
  previousRows: CollaborationReport[],
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
  historyRows: CollaborationReport[] = [...currentRows, ...previousRows],
) {
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const current = fromStatsStart(currentRows).filter(
    (row) => row.operator_user_id && isOtherAccount(accountsById.get(row.account_id), row.operator_user_id),
  );
  const previous = fromStatsStart(previousRows).filter(
    (row) => row.operator_user_id && isOtherAccount(accountsById.get(row.account_id), row.operator_user_id),
  );
  const currentByOperator = new Map<string, CollaborationReport[]>();
  const previousByOperator = new Map<string, CollaborationReport[]>();

  for (const row of current) {
    const userId = row.operator_user_id!;
    const bucket = currentByOperator.get(userId) ?? [];
    bucket.push(row);
    currentByOperator.set(userId, bucket);
  }
  for (const row of previous) {
    const userId = row.operator_user_id!;
    const bucket = previousByOperator.get(userId) ?? [];
    bucket.push(row);
    previousByOperator.set(userId, bucket);
  }

  return Array.from(currentByOperator.entries())
    .map(([userId, operatorRows]) => {
      const byAccount = new Map<string, CollaborationReport[]>();
      for (const row of operatorRows) {
        const bucket = byAccount.get(row.account_id) ?? [];
        bucket.push(row);
        byAccount.set(row.account_id, bucket);
      }
      const totalPlay = operatorRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
      const accountIds = Array.from(byAccount.keys());
      const ownerProfileIds = unique(
        accountIds.map((accountId) => accountsById.get(accountId)?.profile_id),
      );
      const accountRows = Array.from(byAccount.entries())
        .map(([accountId, rows]) => {
          const account = accountsById.get(accountId);
          return {
            accountId,
            accountName: account?.name?.trim() || "未命名账号",
            ownerName: account?.profile_id ? names.get(account.profile_id) ?? "未命名成员" : "未命名成员",
            reportCount: rows.length,
            totalPlay: rows.reduce((sum, row) => sum + asCount(row.play_count), 0),
            totalFollowerConvert: rows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
          };
        })
        .sort((a, b) => b.totalPlay - a.totalPlay || a.accountName.localeCompare(b.accountName, "zh-CN"));

      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        reportCount: operatorRows.length,
        effectiveCount: countWorkQuality(operatorRows).effectiveCount,
        excellentCount: countWorkQuality(operatorRows).excellentCount,
        totalPlay,
        avgPlay: Math.floor(totalPlay / operatorRows.length),
        totalFollowerConvert: operatorRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
        // 候选作品只算该运营负责的记录，历史样本要覆盖同账号所有日报，不能随责任人补录而漂移。
        hitCount: countHits(operatorRows, fromStatsStart(historyRows)),
        momChange: monthOverMonth(totalPlay, previousByOperator.get(userId) ?? []),
        accountCount: accountIds.length,
        operatedProfileCount: ownerProfileIds.length,
        accounts: accountRows,
      };
    })
    .sort((a, b) => b.totalPlay - a.totalPlay || a.name.localeCompare(b.name, "zh-CN"));
}

export function buildStaff(
  rows: CollaborationReport[],
  role: "writer" | "editor",
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
  certifications: WriterEligibility[] = [],
) {
  const scopedRows = fromStatsStart(rows).filter((row) => roleUserId(row, role));
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const byStaff = new Map<string, CollaborationReport[]>();
  const certifiedWriters = new Map(certifications.filter((c) => c.certified).map((c) => [c.userId, c]));
  if (role === "writer") {
    for (const id of certifiedWriters.keys()) byStaff.set(id, []);
  }

  for (const row of scopedRows) {
    const userId = roleUserId(row, role)!;
    if (role === "editor" && !isOtherAccount(accountsById.get(row.account_id), userId)) continue;
    // 无论是否认证，有文案署名产出即统计真实作品与播放数据
    const bucket = byStaff.get(userId) ?? [];
    bucket.push(row);
    byStaff.set(userId, bucket);
  }

  return Array.from(byStaff.entries())
    .map(([userId, staffRows]) => {
      const totalPlay = staffRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
      const accountIds = unique(staffRows.map((row) => row.account_id));
      const involvedAccounts = accountIds
        .map((accountId) => ({
          accountId,
          accountName: accountsById.get(accountId)?.name?.trim() || "未命名账号",
        }))
        .sort((a, b) => a.accountName.localeCompare(b.accountName, "zh-CN"));
      const works = [...staffRows]
        .sort((a, b) => b.report_date.localeCompare(a.report_date) || b.id.localeCompare(a.id))
        .map((row) => ({
          reportId: row.id,
          reportDate: row.report_date,
          title: row.title?.trim() || "未命名作品",
          accountName: accountsById.get(row.account_id)?.name?.trim() || "未命名账号",
          playCount: row.play_count,
          dataSource: row.data_source ?? null,
        }));
      const quality = countWorkQuality(staffRows);
      const isCertified = role === "writer" ? certifiedWriters.has(userId) : true;
      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        reportCount: staffRows.length,
        effectiveCount: quality.effectiveCount,
        excellentCount: quality.excellentCount,
        billingCount: role === "writer" ? (isCertified ? quality.billingCount : null) : quality.billingCount,
        certifiedByName: role === "writer" ? certifiedWriters.get(userId)?.certifiedByName ?? null : null,
        isCertified,
        totalPlay,
        avgPlay: staffRows.length ? Math.floor(totalPlay / staffRows.length) : 0,
        selfHandledCount: staffRows.filter(isSelfHandled).length,
        involvedAccounts,
        involvedAccountTotal: involvedAccounts.length,
        recentWorks: works.slice(0, 3),
        works,
      };
    })
    .sort((a, b) => b.reportCount - a.reportCount || a.name.localeCompare(b.name, "zh-CN"));
}

function shanghaiDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function normalizeMatchText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function makeAnomalyIndexEntry(
  map: Map<string, { count: number; anomaly: string | null }>,
  key: string,
  anomaly: string | null,
) {
  const current = map.get(key);
  if (!current) {
    map.set(key, { count: 1, anomaly });
    return;
  }
  current.count += 1;
}

function anomalyIndexes(videos: CollaborationVideo[]) {
  const byVideoId = new Map<string, string | null>();
  const byAccountDateTitle = new Map<string, { count: number; anomaly: string | null }>();
  const byAccountDate = new Map<string, { count: number; anomaly: string | null }>();

  for (const video of videos) {
    byVideoId.set(video.id, video.anomaly_status ?? null);
    const dates = unique([shanghaiDate(video.published_at), shanghaiDate(video.uploaded_at)]);
    for (const date of dates) {
      makeAnomalyIndexEntry(byAccountDate, `${video.account_id}|${date}`, video.anomaly_status ?? null);
      const title = normalizeMatchText(video.video_title);
      if (title) {
        makeAnomalyIndexEntry(
          byAccountDateTitle,
          `${video.account_id}|${date}|${title}`,
          video.anomaly_status ?? null,
        );
      }
    }
  }

  return { byVideoId, byAccountDateTitle, byAccountDate };
}

function resolveReportAnomaly(
  report: Pick<CollaborationReport, "account_id" | "report_date" | "title" | "video_id">,
  indexes: ReturnType<typeof anomalyIndexes>,
) {
  const videoId = normalizeMatchText(report.video_id);
  if (videoId) {
    return indexes.byVideoId.has(videoId) ? indexes.byVideoId.get(videoId) ?? null : null;
  }

  const title = normalizeMatchText(report.title);
  if (title) {
    const titleEntry = indexes.byAccountDateTitle.get(`${report.account_id}|${report.report_date}|${title}`);
    if (titleEntry?.count === 1) return titleEntry.anomaly;
  }

  const dateEntry = indexes.byAccountDate.get(`${report.account_id}|${report.report_date}`);
  return dateEntry?.count === 1 ? dateEntry.anomaly : null;
}

export function buildPersonPayload(input: {
  targetUserId: string;
  year: number;
  month: number;
  reports: CollaborationReport[];
  profile: CollaborationProfile;
  profiles: CollaborationProfile[];
  accounts: CollaborationAccount[];
  videos: CollaborationVideo[];
  historyRows?: CollaborationReport[];
  writerCertifications?: WriterEligibility[];
}) {
  const ranges = getSixMonthRanges(input.year, input.month);
  const currentRange = ranges.at(-1)!;
  const previousRange = getPreviousMonthRange(input.year, input.month);
  const reports = fromStatsStart(input.reports).filter(
    (row) => roleList(row, input.targetUserId).length > 0,
  );
  const currentRows = reports.filter(
    (row) => row.report_date >= currentRange.start && row.report_date <= currentRange.end,
  );
  const previousRows = reports.filter(
    (row) => row.report_date >= previousRange.start && row.report_date <= previousRange.end,
  );
  const currentOperatorRows = currentRows.filter((row) => row.operator_user_id === input.targetUserId);
  const previousOperatorRows = previousRows.filter((row) => row.operator_user_id === input.targetUserId);
  const historyRows = fromStatsStart(input.historyRows ?? input.reports);
  const anomalies = anomalyIndexes(input.videos);

  const operator = currentOperatorRows.length > 0
    ? buildOperators(currentOperatorRows, previousOperatorRows, input.profiles, input.accounts, historyRows).find(
        (item) => item.userId === input.targetUserId,
      ) ?? null
    : null;
  const operatorSummary = operator
    ? {
        reportCount: operator.reportCount,
        totalPlay: operator.totalPlay,
        avgPlay: operator.avgPlay,
        totalFollowerConvert: operator.totalFollowerConvert,
        hitCount: operator.hitCount,
        momChange: operator.momChange,
        accountCount: operator.accountCount,
        operatedProfileCount: operator.operatedProfileCount,
      }
    : null;

  return {
    userId: input.targetUserId,
    name: input.profile.name?.trim() || "未命名成员",
    teamId: input.profile.team_id,
    currentMonth: {
      writerCount: currentRows.filter((row) => row.script_author_user_id === input.targetUserId).length,
      editorCount: currentRows.filter((row) => row.video_editor_user_id === input.targetUserId).length,
      operatorCount: currentOperatorRows.length,
    },
    operatorSummary,
    trend: ranges.map((range) => {
      const monthRows = reports.filter(
        (row) => row.report_date >= range.start && row.report_date <= range.end,
      );
      return {
        year: range.year,
        month: range.month,
        writerCount: monthRows.filter((row) => row.script_author_user_id === input.targetUserId).length,
        editorCount: monthRows.filter((row) => row.video_editor_user_id === input.targetUserId).length,
        operatorCount: monthRows.filter((row) => row.operator_user_id === input.targetUserId).length,
      };
    }),
    records: currentRows
      .map((row) => ({
        reportId: row.id,
        reportDate: row.report_date,
        accountId: row.account_id,
        accountName: input.accounts.find((account) => account.id === row.account_id)?.name?.trim() || "未命名账号",
        title: row.title,
        playCount: asCount(row.play_count),
        roles: roleList(row, input.targetUserId),
        dataSource: row.data_source ?? null,
        anomaly: resolveReportAnomaly(row, anomalies),
      }))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.reportId.localeCompare(b.reportId)),
  };
}

export async function queryScopedReports(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  start: string;
  end: string;
  assignedUserId?: string;
}) {
  if (input.visibleUserIds.length === 0 || input.end < STATS_START_DATE) return [];
  const rows: CollaborationReport[] = [];

  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    let query = input.supabase
      .from("daily_reports")
      .select(DAILY_REPORT_FIELDS)
      .in("user_id", input.visibleUserIds)
      .gte("report_date", STATS_START_DATE)
      .gte("report_date", input.start)
      .lte("report_date", input.end)
      .eq("is_void", false);
    if (input.assignedUserId) {
      query = query.or(
        `script_author_user_id.eq.${input.assignedUserId},video_editor_user_id.eq.${input.assignedUserId},operator_user_id.eq.${input.assignedUserId}`,
      );
    }
    let result = await query
      // Secondary ordering keeps offset pagination deterministic when many rows share a date.
      .order("report_date", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + REPORT_PAGE_SIZE - 1);
    // 允许应用先于数据库迁移部署，旧库仍可展示完整岗位数据；迁移后自动读取来源字段。
    if (result.error && /data_source|schema cache|column .* does not exist/i.test(result.error.message ?? "")) {
      let fallbackQuery = input.supabase
        .from("daily_reports")
        .select(DAILY_REPORT_FIELDS_BEFORE_DATA_SOURCE)
        .in("user_id", input.visibleUserIds)
        .gte("report_date", STATS_START_DATE)
        .gte("report_date", input.start)
        .lte("report_date", input.end);
      if (input.assignedUserId) {
        fallbackQuery = fallbackQuery.or(
          `script_author_user_id.eq.${input.assignedUserId},video_editor_user_id.eq.${input.assignedUserId},operator_user_id.eq.${input.assignedUserId}`,
        );
      }
      result = await fallbackQuery
        .order("report_date", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + REPORT_PAGE_SIZE - 1);
    }
    assertSupabaseQuerySucceeded(result.error, "加载协作日报失败");

    const page = (result.data ?? []) as unknown as CollaborationReport[];
    rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) break;
  }

  return rows;
}

async function loadProfiles(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return [];
  const result = await queryProfiles<Record<string, unknown>[]>((fields) =>
    supabase.from("profiles").select(fields).in("id", ids),
  );
  assertSupabaseQuerySucceeded(result.error, "加载协作成员失败");
  return (result.data ?? []).map(mapProfileRow);
}

async function loadAccounts(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return [];
  const result = await supabase
    .from("accounts")
    .select("id, name, profile_id")
    .in("id", ids);
  assertSupabaseQuerySucceeded(result.error, "加载协作账号失败");
  return (result.data ?? []) as CollaborationAccount[];
}

async function loadLookups(supabase: SupabaseClient, rows: CollaborationReport[]) {
  const accounts = await loadAccounts(supabase, unique(rows.map((row) => row.account_id)));
  const profileIds = unique([
    ...rows.flatMap((row) => [
      row.user_id,
      row.script_author_user_id,
      row.video_editor_user_id,
      row.operator_user_id,
    ]),
    ...accounts.map((account) => account.profile_id),
  ]);
  const profiles = await loadProfiles(supabase, profileIds);
  return { profiles, accounts };
}

export type CollaborationMonthDataset = {
  currentRows: CollaborationReport[];
  previousRows: CollaborationReport[];
  historyRows?: CollaborationReport[];
  writerCertifications?: WriterEligibility[];
  profiles: CollaborationProfile[];
  accounts: CollaborationAccount[];
  /** 可见范围（原样带入 scope.visibleUserIds）：组详情只出范围成员，组员只读自己。 */
  visibleUserIds?: string[];
  /** 工种小队目录；只在需要「按团队」时加载，恒定两次查询，不随小队数量增长。 */
  workGroups?: WorkGroupDirectory;
};

/**
 * 协作页首屏共享数据集：统计起点~当月末的日报一次查询，内存按月切分；
 * summary/operators/talents/staff 原先分别扫描当月日报，现共享 1 份行集。
 * 各岗位在内存完成统计起点与责任人过滤。
 */
export async function loadCollaborationMonthDataset(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  range: MonthRange;
  includeWriterCertifications?: boolean;
  /** 传了团队 id 才顺带加载工种小队目录；按岗位模式不传，零额外查询。 */
  workGroupTeamIds?: Array<string | null | undefined>;
}): Promise<CollaborationMonthDataset> {
  const previousRange = getPreviousMonthRange(input.range.year, input.range.month);
  const rows = await queryScopedReports({
    supabase: input.supabase,
    visibleUserIds: input.visibleUserIds,
    start: STATS_START_DATE,
    end: input.range.end,
  });
  const currentRows = rows.filter((row) => row.report_date >= input.range.start);
  const previousRows = rows.filter(
    (row) => row.report_date >= previousRange.start && row.report_date <= previousRange.end,
  );
  const { profiles, accounts } = await loadLookups(input.supabase, rows);
  const writerCertifications = input.includeWriterCertifications
    ? await loadWriterCertifications(input.supabase, input.visibleUserIds) : [];
  const missingIds = writerCertifications.filter(c => c.certified && !profiles.some(p => p.id === c.userId)).map(c => c.userId);
  profiles.push(...await loadProfiles(input.supabase, missingIds));
  const workGroups = input.workGroupTeamIds
    ? await loadWorkGroupDirectory(input.supabase, { teamIds: input.workGroupTeamIds })
    : undefined;
  return {
    currentRows,
    previousRows,
    historyRows: rows,
    profiles,
    accounts,
    writerCertifications,
    visibleUserIds: input.visibleUserIds,
    workGroups,
  };
}

export function buildCollaborationPageData(
  dataset: CollaborationMonthDataset,
  staffRole: "writer" | "editor" | null = null,
  onlyUserId?: string,
) {
  const operators = buildOperators(
    dataset.currentRows,
    dataset.previousRows,
    dataset.profiles,
    dataset.accounts,
    dataset.historyRows ?? [...dataset.currentRows, ...dataset.previousRows],
  );
  const historyRows = dataset.historyRows ?? [...dataset.currentRows, ...dataset.previousRows];
  const talents = buildTalents(dataset.currentRows, dataset.profiles, dataset.accounts, historyRows);
  const staff = staffRole
    ? buildStaff(dataset.currentRows, staffRole, dataset.profiles, dataset.accounts, dataset.writerCertifications)
    : [];

  return {
    summary: buildSummary(dataset.currentRows),
    operators: onlyUserId ? operators.filter((row) => row.userId === onlyUserId) : operators,
    talents: onlyUserId ? talents.filter((row) => row.userId === onlyUserId) : talents,
    staff: onlyUserId ? staff.filter((row) => row.userId === onlyUserId) : staff,
  };
}

export type TalentAccount = {
  accountId: string;
  accountName: string;
  reportCount: number;
  totalPlay: number;
  totalFollowerConvert: number;
};

export type TalentRow = {
  effectiveCount: number;
  excellentCount: number;
  userId: string;
  name: string;
  accountCount: number;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  hitCount: number;
  selfHandledCount: number;
  accounts: TalentAccount[];
};

export function buildTalents(
  rows: CollaborationReport[],
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
  historyRows: CollaborationReport[] = rows,
): TalentRow[] {
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const scopedRows = fromStatsStart(rows);

  const talentAccountsByUser = new Map<string, Set<string>>();
  for (const account of accounts) {
    if (!account.profile_id) continue;
    const set = talentAccountsByUser.get(account.profile_id) ?? new Set();
    set.add(account.id);
    talentAccountsByUser.set(account.profile_id, set);
  }

  if (talentAccountsByUser.size === 0) return [];

  return Array.from(talentAccountsByUser.entries())
    .map(([userId, ownAccountIds]) => {
      const talentRows = scopedRows.filter((row) => ownAccountIds.has(row.account_id));
      if (talentRows.length === 0) return null;
      const totalPlay = talentRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
      const talentAccounts: TalentAccount[] = Array.from(ownAccountIds)
        .map((accountId) => {
          const accountRows = talentRows.filter((row) => row.account_id === accountId);
          if (accountRows.length === 0) return null;
          return {
            accountId,
            accountName: accountsById.get(accountId)?.name?.trim() || "未命名账号",
            reportCount: accountRows.length,
            totalPlay: accountRows.reduce((sum, row) => sum + asCount(row.play_count), 0),
            totalFollowerConvert: accountRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
          };
        })
        .filter((a): a is TalentAccount => a !== null)
        .sort((a, b) => b.totalPlay - a.totalPlay || a.accountName.localeCompare(b.accountName, "zh-CN"));

      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        accountCount: talentAccounts.length,
        reportCount: talentRows.length,
        effectiveCount: countWorkQuality(talentRows).effectiveCount,
        excellentCount: countWorkQuality(talentRows).excellentCount,
        totalPlay,
        avgPlay: talentRows.length > 0 ? Math.floor(totalPlay / talentRows.length) : 0,
        totalFollowerConvert: talentRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
        hitCount: countHits(talentRows, fromStatsStart(historyRows)),
        selfHandledCount: talentRows.filter(isSelfHandled).length,
        accounts: talentAccounts,
      };
    })
    .filter((row): row is TalentRow => row !== null)
    .sort((a, b) => b.totalPlay - a.totalPlay || a.name.localeCompare(b.name, "zh-CN"));
}

/** 组员行 = 现有三个岗位 builder 的行形状（不另建字段口径）。 */
export type StaffRow = ReturnType<typeof buildStaff>[number];
export type OperatorRow = ReturnType<typeof buildOperators>[number];
export type WorkGroupMemberRow = StaffRow | TalentRow | OperatorRow;

/**
 * 组综合：只做组内合计，不改个人口径，字段与该岗位表可见列一一对应。
 * - 条均播放 = floor(组总播放 / 组件数)，0 件为 0（与个人行同口径，不用均值再平均）。
 * - 账号数 = 组内账号去重并集（不是个人账号数相加，避免同一账号被重复计）。
 * - 文案组绩效（billingCount）：只加已认证成员；组内无人认证时为 null（与个人未认证为 null 一致），
 *   不显示成「绩效 0 条」以免被读成「已结算但为 0」。
 * - 运营组环比：分母取组上月总播放；无上月数据或上月为 0 时为 null（与个人环比同口径）。
 * - `kind` 与 `WorkGroupSummaryRow.kind` 恒等，便于前端按 kind 收窄类型。
 */
export type WorkGroupWriterAggregate = {
  kind: "writer";
  reportCount: number;
  accountCount: number;
  totalPlay: number;
  avgPlay: number;
  effectiveCount: number;
  excellentCount: number;
  billingCount: number | null;
  certifiedMemberCount: number;
};

export type WorkGroupTalentAggregate = {
  kind: "talent";
  accountCount: number;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  effectiveCount: number;
  excellentCount: number;
  hitCount: number;
  selfHandledCount: number;
};

export type WorkGroupOperatorAggregate = {
  kind: "operator";
  accountCount: number;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  effectiveCount: number;
  excellentCount: number;
  hitCount: number;
  momChange: number | null;
};

export type WorkGroupAggregate =
  | WorkGroupWriterAggregate
  | WorkGroupTalentAggregate
  | WorkGroupOperatorAggregate;

export type WorkGroupSummaryRow = {
  id: string;
  name: string;
  kind: WorkGroupKind;
  teamId: string;
  /** 可见范围内的小队人数：与 `members` 行数严格相等，不出现「人数 5 / 只出 2 行」。 */
  memberCount: number;
  aggregate: WorkGroupAggregate;
};

export type WorkGroupDetailView = {
  summary: WorkGroupSummaryRow;
  /** 先按小队当前编制名单出全员行（零产出、文案未认证也出行），再叠加统计。 */
  members: WorkGroupMemberRow[];
};

export type WorkGroupViews = {
  /** false = 库还没跑 work_groups migration，按团队模式应显示「尚未上线」而不是空列表。 */
  ready: boolean;
  groups: WorkGroupSummaryRow[];
  details: WorkGroupDetailView[];
};

function groupTotal<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

function avgPlayOf(totalPlay: number, reportCount: number) {
  return reportCount > 0 ? Math.floor(totalPlay / reportCount) : 0;
}

function accountIdCount(rows: Array<{ accountId: string }>): number {
  return new Set(rows.map((row) => row.accountId)).size;
}

export function buildWriterGroupAggregate(members: StaffRow[]): WorkGroupWriterAggregate {
  const totalPlay = groupTotal(members, (member) => member.totalPlay);
  const reportCount = groupTotal(members, (member) => member.reportCount);
  const certified = members.filter((member) => member.isCertified === true);
  return {
    kind: "writer",
    reportCount,
    accountCount: accountIdCount(members.flatMap((member) => member.involvedAccounts)),
    totalPlay,
    avgPlay: avgPlayOf(totalPlay, reportCount),
    effectiveCount: groupTotal(members, (member) => member.effectiveCount),
    excellentCount: groupTotal(members, (member) => member.excellentCount),
    billingCount: certified.length > 0
      ? groupTotal(certified, (member) => member.billingCount ?? 0)
      : null,
    certifiedMemberCount: certified.length,
  };
}

export function buildTalentGroupAggregate(members: TalentRow[]): WorkGroupTalentAggregate {
  const totalPlay = groupTotal(members, (member) => member.totalPlay);
  const reportCount = groupTotal(members, (member) => member.reportCount);
  return {
    kind: "talent",
    accountCount: accountIdCount(members.flatMap((member) => member.accounts)),
    reportCount,
    totalPlay,
    avgPlay: avgPlayOf(totalPlay, reportCount),
    effectiveCount: groupTotal(members, (member) => member.effectiveCount),
    excellentCount: groupTotal(members, (member) => member.excellentCount),
    hitCount: groupTotal(members, (member) => member.hitCount),
    selfHandledCount: groupTotal(members, (member) => member.selfHandledCount),
  };
}

export function buildOperatorGroupAggregate(
  members: OperatorRow[],
  previousPlayByUser: Map<string, number>,
): WorkGroupOperatorAggregate {
  const totalPlay = groupTotal(members, (member) => member.totalPlay);
  const reportCount = groupTotal(members, (member) => member.reportCount);
  const previousTotalPlay = groupTotal(members, (member) => previousPlayByUser.get(member.userId) ?? 0);
  return {
    kind: "operator",
    accountCount: accountIdCount(members.flatMap((member) => member.accounts)),
    reportCount,
    totalPlay,
    avgPlay: avgPlayOf(totalPlay, reportCount),
    totalFollowerConvert: groupTotal(members, (member) => member.totalFollowerConvert),
    effectiveCount: groupTotal(members, (member) => member.effectiveCount),
    excellentCount: groupTotal(members, (member) => member.excellentCount),
    hitCount: groupTotal(members, (member) => member.hitCount),
    momChange: previousTotalPlay > 0 ? (totalPlay - previousTotalPlay) / previousTotalPlay : null,
  };
}

function emptyStaffRow(member: WorkGroupRosterMember, certifications: WriterEligibility[] = []): StaffRow {
  const certified = certifications.find((item) => item.userId === member.id && item.certified);
  return {
    userId: member.id,
    name: member.name?.trim() || "未命名成员",
    reportCount: 0,
    effectiveCount: 0,
    excellentCount: 0,
    // 未认证与 buildStaff 一致留 null（未结算 ≠ 结算 0 条）
    billingCount: certified ? 0 : null,
    certifiedByName: certified?.certifiedByName ?? null,
    isCertified: Boolean(certified),
    totalPlay: 0,
    avgPlay: 0,
    selfHandledCount: 0,
    involvedAccounts: [],
    involvedAccountTotal: 0,
    recentWorks: [],
    works: [],
  };
}

function emptyTalentRow(member: WorkGroupRosterMember): TalentRow {
  return {
    userId: member.id,
    name: member.name?.trim() || "未命名成员",
    accountCount: 0,
    reportCount: 0,
    effectiveCount: 0,
    excellentCount: 0,
    totalPlay: 0,
    avgPlay: 0,
    totalFollowerConvert: 0,
    hitCount: 0,
    selfHandledCount: 0,
    accounts: [],
  };
}

function emptyOperatorRow(member: WorkGroupRosterMember): OperatorRow {
  return {
    userId: member.id,
    name: member.name?.trim() || "未命名成员",
    reportCount: 0,
    effectiveCount: 0,
    excellentCount: 0,
    totalPlay: 0,
    avgPlay: 0,
    totalFollowerConvert: 0,
    hitCount: 0,
    momChange: null,
    accountCount: 0,
    operatedProfileCount: 0,
    accounts: [],
  };
}

function sortByStats<T extends { name: string }>(rows: T[], pick: (row: T) => number): T[] {
  return [...rows].sort((a, b) => pick(b) - pick(a) || a.name.localeCompare(b.name, "zh-CN"));
}

/**
 * 「按团队」的组综合与组详情：`WorkGroupSummaryRow[]` + 每组 `WorkGroupDetailView`。
 *
 * - 统计口径完全复用 `buildStaff` / `buildTalents` / `buildOperators`，本函数只做「取组 → 补全员行 → 求和」。
 * - 三个 builder 每次调用只跑一次，按需分派（没有该 kind 的小队就不跑），不做逐组查询。
 * - 编制名单取 `dataset.workGroups.roster`（按 team_id 取本公司全体，含零产出成员），
 *   再用 `dataset.visibleUserIds` 做范围裁剪：组员只读自己时，人数与组员行同步收窄。
 * - 历史月份按当前编制回看（本轮不做编制考古）。
 */
export function buildWorkGroupViews(dataset: CollaborationMonthDataset): WorkGroupViews {
  const directory = dataset.workGroups;
  if (!directory || directory.groups.length === 0) {
    return { ready: directory?.ready ?? true, groups: [], details: [] };
  }

  const scope = dataset.visibleUserIds ? new Set(dataset.visibleUserIds) : null;
  const kinds = new Set(directory.groups.map((group) => group.kind));
  const historyRows = dataset.historyRows ?? [...dataset.currentRows, ...dataset.previousRows];

  const writerByUser = new Map<string, StaffRow>();
  if (kinds.has("writer")) {
    for (const row of buildStaff(
      dataset.currentRows,
      "writer",
      dataset.profiles,
      dataset.accounts,
      dataset.writerCertifications,
    )) {
      writerByUser.set(row.userId, row);
    }
  }

  const talentByUser = new Map<string, TalentRow>();
  if (kinds.has("talent")) {
    for (const row of buildTalents(dataset.currentRows, dataset.profiles, dataset.accounts, historyRows)) {
      talentByUser.set(row.userId, row);
    }
  }

  const operatorByUser = new Map<string, OperatorRow>();
  const previousOperatorPlay = new Map<string, number>();
  if (kinds.has("operator")) {
    for (const row of buildOperators(
      dataset.currentRows,
      dataset.previousRows,
      dataset.profiles,
      dataset.accounts,
      historyRows,
    )) {
      operatorByUser.set(row.userId, row);
    }
    // 组环比要看组上月总播放，个人行的 momChange 是比率不能相加，单独按上月重算一次。
    for (const row of buildOperators(
      dataset.previousRows,
      [],
      dataset.profiles,
      dataset.accounts,
      historyRows,
    )) {
      previousOperatorPlay.set(row.userId, row.totalPlay);
    }
  }

  const groups: WorkGroupSummaryRow[] = [];
  const details: WorkGroupDetailView[] = [];
  const ordered = [...directory.groups].sort(
    (a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name, "zh-CN"),
  );

  for (const group of ordered) {
    const roster = directory.roster.filter(
      (member) =>
        (workGroupSlotForKind(group.kind) === "operator" ? member.operatorGroupId : member.peerGroupId) ===
          group.id && (!scope || scope.has(member.id)),
    );

    if (group.kind === "writer") {
      const members = sortByStats(
        roster.map((member) => writerByUser.get(member.id) ?? emptyStaffRow(member, dataset.writerCertifications)),
        (member) => member.reportCount,
      );
      pushGroup(groups, details, group, members, buildWriterGroupAggregate(members));
    } else if (group.kind === "talent") {
      const members = sortByStats(
        roster.map((member) => talentByUser.get(member.id) ?? emptyTalentRow(member)),
        (member) => member.totalPlay,
      );
      pushGroup(groups, details, group, members, buildTalentGroupAggregate(members));
    } else {
      const members = sortByStats(
        roster.map((member) => operatorByUser.get(member.id) ?? emptyOperatorRow(member)),
        (member) => member.totalPlay,
      );
      pushGroup(groups, details, group, members, buildOperatorGroupAggregate(members, previousOperatorPlay));
    }
  }

  return { ready: true, groups, details };
}

function kindOrder(kind: WorkGroupKind) {
  return kind === "writer" ? 0 : kind === "talent" ? 1 : 2;
}

function pushGroup(
  groups: WorkGroupSummaryRow[],
  details: WorkGroupDetailView[],
  group: WorkGroupRow,
  members: WorkGroupMemberRow[],
  aggregate: WorkGroupAggregate,
) {
  const summary: WorkGroupSummaryRow = {
    id: group.id,
    name: group.name,
    kind: group.kind,
    teamId: group.teamId,
    memberCount: members.length,
    aggregate,
  };
  groups.push(summary);
  details.push({ summary, members });
}

function reportRangeToUtc(start: string, end: string) {
  const startUtc = new Date(`${start}T00:00:00+08:00`).toISOString();
  const endDate = new Date(`${end}T00:00:00+08:00`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return { startUtc, endUtc: endDate.toISOString() };
}

async function loadVideosForReports(supabase: SupabaseClient, rows: CollaborationReport[]) {
  if (rows.length === 0) return [];
  const dates = rows.map((row) => row.report_date).sort();
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
}) {
  const ranges = getSixMonthRanges(input.year, input.month);
  // 成员档案与 6 个月日报两查互不依赖，并行取（2026-08-30）
  const [profileResult, reportsResult] = await Promise.all([
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
    loadAccounts(input.supabase, unique(roleReports.map((row) => row.account_id))),
    loadVideosForReports(input.supabase, currentRows),
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
    historyRows: reports,
  });
}

export function parseAttributionPayload(value: unknown):
  | { ok: true; data: AttributionPayload }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "请求体不正确" };
  }
  const body = value as Record<string, unknown>;
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  if (!UUID_PATTERN.test(reportId)) return { ok: false, error: "reportId 必须是合法 UUID" };

  const fields = ["scriptAuthorUserId", "videoEditorUserId", "operatorUserId"] as const;
  const normalized: Record<(typeof fields)[number], string | null> = {
    scriptAuthorUserId: null,
    videoEditorUserId: null,
    operatorUserId: null,
  };
  for (const field of fields) {
    if (!(field in body)) return { ok: false, error: `${field} 为必填字段` };
    if (body[field] === null) {
      normalized[field] = null;
      continue;
    }
    const userId = typeof body[field] === "string" ? body[field].trim() : "";
    if (!UUID_PATTERN.test(userId)) return { ok: false, error: `${field} 必须是合法 UUID 或 null` };
    normalized[field] = userId;
  }

  return { ok: true, data: { reportId, ...normalized } };
}

export async function loadAttributionReport(supabase: SupabaseClient, reportId: string) {
  const result = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id, report_date")
    .eq("id", reportId)
    .gte("report_date", STATS_START_DATE)
    .eq("is_void", false)
    .maybeSingle();
  assertSupabaseQuerySucceeded(result.error, "加载待补录日报失败");
  return (result.data as AttributionReport | null) ?? null;
}

export async function assertProfilesExist(supabase: SupabaseClient, userIds: string[]) {
  const ids = unique(userIds);
  if (ids.length === 0) return true;
  const result = await loadWithMembershipFallback({
    loadWithMembership: async () => supabase.from("profiles").select("id, membership_status").in("id", ids),
    loadWithoutMembership: async () => supabase.from("profiles").select("id").in("id", ids),
  });
  assertSupabaseQuerySucceeded(result.error, "校验归属成员失败");
  const rows = (result.data ?? []) as Array<{ id: string; membership_status?: string | null }>;
  return unique(filterActiveMemberships(rows).map((row) => row.id)).length === ids.length;
}

export async function updateAttributionAtomically(
  supabase: Pick<SupabaseClient, "rpc">,
  payload: AttributionPayload,
) {
  const result = await supabase.rpc("update_collaboration_attribution", {
    p_report_id: payload.reportId,
    p_script_author_user_id: payload.scriptAuthorUserId,
    p_video_editor_user_id: payload.videoEditorUserId,
    p_operator_user_id: payload.operatorUserId,
  });
  assertSupabaseQuerySucceeded(result.error, "更新协作归属失败");
  const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  return { videoUpdated: data.videoUpdated === true };
}
