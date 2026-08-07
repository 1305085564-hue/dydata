import type { SupabaseClient } from "@supabase/supabase-js";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import { filterActiveMemberships, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { getAccountBaseline, median } from "@/lib/video-metrics";

export const STATS_START_DATE = "2026-07-27";

const DAILY_REPORT_FIELDS = [
  "id",
  "user_id",
  "report_date",
  "account_id",
  "title",
  "play_count",
  "follower_convert",
  "script_author_user_id",
  "video_editor_user_id",
  "operator_user_id",
].join(", ");

export type CollaborationRole = "writer" | "editor" | "operator";

export type CollaborationReport = {
  id: string;
  user_id: string;
  report_date: string;
  account_id: string;
  title: string;
  play_count: number | null;
  follower_convert: number | null;
  script_author_user_id: string | null;
  video_editor_user_id: string | null;
  operator_user_id: string | null;
};

export type CollaborationProfile = {
  id: string;
  name: string | null;
  team_id: string | null;
};

export type CollaborationAccount = {
  id: string;
  name: string | null;
  profile_id: string | null;
};

export type CollaborationVideo = {
  id: string;
  account_id: string;
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

export function buildSummary(rows: CollaborationReport[], profiles: CollaborationProfile[]) {
  const scopedRows = fromStatsStart(rows);
  const names = profileNameMap(profiles);
  const rowsByOwner = new Map<string, CollaborationReport[]>();

  for (const row of scopedRows) {
    const bucket = rowsByOwner.get(row.user_id) ?? [];
    bucket.push(row);
    rowsByOwner.set(row.user_id, bucket);
  }

  const neverFillMembers = Array.from(rowsByOwner.entries())
    .filter(([, ownerRows]) => ownerRows.length > 0 && ownerRows.every(isSelfHandled))
    .map(([userId]) => ({ userId, name: names.get(userId) ?? "未命名成员" }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  return {
    total: scopedRows.length,
    attributed: scopedRows.filter(
      (row) => row.script_author_user_id && row.video_editor_user_id && row.operator_user_id,
    ).length,
    selfHandled: scopedRows.filter(isSelfHandled).length,
    unattributed: scopedRows.filter(
      (row) => !row.script_author_user_id || !row.video_editor_user_id || !row.operator_user_id,
    ).length,
    neverFillMembers,
  };
}

function countHits(rows: CollaborationReport[]) {
  const teamMedian = median(rows.map((row) => asCount(row.play_count)));
  const byAccount = new Map<string, number[]>();
  for (const row of rows) {
    const values = byAccount.get(row.account_id) ?? [];
    values.push(asCount(row.play_count));
    byAccount.set(row.account_id, values);
  }

  let hits = 0;
  for (const values of byAccount.values()) {
    const baseline = getAccountBaseline(values, teamMedian).median;
    if (baseline === null || baseline <= 0) continue;
    hits += values.filter((value) => value >= baseline * 2).length;
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
) {
  const current = fromStatsStart(currentRows).filter((row) => row.operator_user_id);
  const previous = fromStatsStart(previousRows).filter((row) => row.operator_user_id);
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
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
      const ownerProfileIds = unique(
        Array.from(byAccount.keys()).map((accountId) => accountsById.get(accountId)?.profile_id),
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
        totalPlay,
        avgPlay: Math.floor(totalPlay / operatorRows.length),
        totalFollowerConvert: operatorRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
        hitCount: countHits(operatorRows),
        momChange: monthOverMonth(totalPlay, previousByOperator.get(userId) ?? []),
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
) {
  const scopedRows = fromStatsStart(rows).filter((row) => roleUserId(row, role));
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const byStaff = new Map<string, CollaborationReport[]>();

  for (const row of scopedRows) {
    const userId = roleUserId(row, role)!;
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
      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        reportCount: staffRows.length,
        totalPlay,
        avgPlay: Math.floor(totalPlay / staffRows.length),
        selfHandledCount: staffRows.filter(isSelfHandled).length,
        involvedAccounts: involvedAccounts.slice(0, 3),
        involvedAccountTotal: involvedAccounts.length,
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

function anomalyMap(videos: CollaborationVideo[]) {
  const result = new Map<string, string | null>();
  for (const video of videos) {
    const dates = unique([shanghaiDate(video.published_at), shanghaiDate(video.uploaded_at)]);
    for (const date of dates) {
      const key = `${video.account_id}|${date}`;
      if (!result.has(key)) result.set(key, video.anomaly_status ?? null);
    }
  }
  return result;
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
  const anomalies = anomalyMap(input.videos);

  const operator = currentOperatorRows.length > 0
    ? buildOperators(currentOperatorRows, previousOperatorRows, input.profiles, input.accounts).find(
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
        anomaly: anomalies.get(`${row.account_id}|${row.report_date}`) ?? null,
      }))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.reportId.localeCompare(b.reportId)),
  };
}

export async function queryScopedReports(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  start: string;
  end: string;
}) {
  if (input.visibleUserIds.length === 0 || input.end < STATS_START_DATE) return [];
  const result = await input.supabase
    .from("daily_reports")
    .select(DAILY_REPORT_FIELDS)
    .in("user_id", input.visibleUserIds)
    .gte("report_date", STATS_START_DATE)
    .gte("report_date", input.start)
    .lte("report_date", input.end)
    .order("report_date", { ascending: false });
  assertSupabaseQuerySucceeded(result.error, "加载协作日报失败");
  return (result.data ?? []) as unknown as CollaborationReport[];
}

async function loadProfiles(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return [];
  const result = await supabase
    .from("profiles")
    .select("id, name, team_id")
    .in("id", ids);
  assertSupabaseQuerySucceeded(result.error, "加载协作成员失败");
  return (result.data ?? []) as CollaborationProfile[];
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

export async function loadSummaryData(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  range: MonthRange;
}) {
  const rows = await queryScopedReports({ ...input, start: input.range.start, end: input.range.end });
  const profiles = await loadProfiles(input.supabase, unique(rows.map((row) => row.user_id)));
  return buildSummary(rows, profiles);
}

export async function loadOperatorsData(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  range: MonthRange;
}) {
  const previousRange = getPreviousMonthRange(input.range.year, input.range.month);
  const [currentRows, previousRows] = await Promise.all([
    queryScopedReports({ ...input, start: input.range.start, end: input.range.end }),
    queryScopedReports({ ...input, start: previousRange.start, end: previousRange.end }),
  ]);
  const lookups = await loadLookups(input.supabase, [...currentRows, ...previousRows]);
  return buildOperators(currentRows, previousRows, lookups.profiles, lookups.accounts);
}

export async function loadStaffData(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  range: MonthRange;
  role: "writer" | "editor";
}) {
  const rows = await queryScopedReports({ ...input, start: input.range.start, end: input.range.end });
  const lookups = await loadLookups(input.supabase, rows);
  return buildStaff(rows, input.role, lookups.profiles, lookups.accounts);
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
    .select("id, account_id, published_at, uploaded_at, anomaly_status")
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
  const profileResult = await input.supabase
    .from("profiles")
    .select("id, name, team_id")
    .eq("id", input.targetUserId)
    .maybeSingle();
  assertSupabaseQuerySucceeded(profileResult.error, "加载个人资料失败");
  if (!profileResult.data) throw new CollaborationNotFoundError("成员不存在");

  const reports = await queryScopedReports({
    supabase: input.supabase,
    visibleUserIds: input.visibleUserIds,
    start: ranges[0]!.start,
    end: ranges.at(-1)!.end,
  });
  const roleReports = reports.filter((row) => roleList(row, input.targetUserId).length > 0);
  const lookups = await loadLookups(input.supabase, roleReports);
  if (!lookups.profiles.some((profile) => profile.id === input.targetUserId)) {
    lookups.profiles.push(profileResult.data as CollaborationProfile);
  }
  const currentRange = ranges.at(-1)!;
  const currentRows = roleReports.filter(
    (row) => row.report_date >= currentRange.start && row.report_date <= currentRange.end,
  );
  const videos = await loadVideosForReports(input.supabase, currentRows);

  return buildPersonPayload({
    targetUserId: input.targetUserId,
    year: input.year,
    month: input.month,
    reports: roleReports,
    profile: profileResult.data as CollaborationProfile,
    profiles: lookups.profiles,
    accounts: lookups.accounts,
    videos,
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
