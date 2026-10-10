import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";
import { STATS_START_DATE } from "./types";
import type {
  CollaborationAccount,
  CollaborationProfile,
  CollaborationReport,
  CollaborationRole,
  CollaborationRoleTab,
  MonthRange,
  PersonGrowthInput,
  VideoSnapshotMetrics,
  WorkGroupPerformanceMetrics,
} from "./types";

export function asCount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function hasPlayCount(row: CollaborationReport) {
  return Number.isFinite(row.play_count);
}

export function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function profileNameMap(profiles: CollaborationProfile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile.name?.trim() || "未命名成员"])); // gate:transient-map 函数内临时聚合，随调用栈释放
}

export function accountMap(accounts: CollaborationAccount[]) {
  return new Map(accounts.map((account) => [account.id, account])); // gate:transient-map 函数内临时聚合，随调用栈释放
}

export function isSelfHandled(row: CollaborationReport) {
  return (
    row.script_author_user_id === row.user_id &&
    row.video_editor_user_id === row.user_id &&
    row.operator_user_id === row.user_id
  );
}

export function fromStatsStart(rows: CollaborationReport[]) {
  return rows.filter((row) => row.report_date >= STATS_START_DATE);
}

/**
 * 作品展示与排序使用视频真实发布时间；没有发布时间的历史日报才回退到业务归属日。
 * `uploaded_at` 不参与回退，避免把次日上传误显示成作品日期。
 */
export function getCollaborationWorkDate(
  row: Pick<CollaborationReport, "report_date" | "published_at">,
) {
  if (row.published_at) {
    const publishedAt = new Date(row.published_at);
    if (!Number.isNaN(publishedAt.getTime())) return formatShanghaiDateOnly(publishedAt);
  }
  return row.report_date;
}

export function roleUserId(row: CollaborationReport, role: "writer" | "editor") {
  return role === "writer" ? row.script_author_user_id : row.video_editor_user_id;
}

export function isOtherAccount(account: CollaborationAccount | undefined, userId: string) {
  // 账号未绑定主人时无法证明是自己的，按别人的账号计入，避免漏掉真服务岗
  return !account?.profile_id || account.profile_id !== userId;
}

export function roleList(row: CollaborationReport, targetUserId: string): CollaborationRole[] {
  const roles: CollaborationRole[] = [];
  if (row.script_author_user_id === targetUserId) roles.push("writer");
  if (row.video_editor_user_id === targetUserId) roles.push("editor");
  if (row.operator_user_id === targetUserId) roles.push("operator");
  return roles;
}

export function isGrowthRoleMatch(
  row: CollaborationReport,
  targetUserId: string,
  role: CollaborationRoleTab,
  accountsById: Map<string, CollaborationAccount>,
) {
  const accountOwnerId = accountsById.get(row.account_id)?.profile_id;
  if (role === "talents") return accountOwnerId === targetUserId;
  if (role === "operators") {
    return row.operator_user_id === targetUserId && accountOwnerId !== targetUserId;
  }
  if (role === "writers") return row.script_author_user_id === targetUserId;
  return row.video_editor_user_id === targetUserId && accountOwnerId !== targetUserId;
}

/** 增长曲线的自然日窗口：上海时区含今天往前数 30 天，不跟随页面历史月份。 */
export function growthWindowStart(today: string) {
  return shiftDateOnly(new Date(`${today}T00:00:00.000Z`), -29);
}

/**
 * 增长曲线的入选日报：先锁近 30 个自然日，再按对应岗位榜单的归属口径筛选。
 * 与 buildTalents / buildOperators / buildStaff 同源（含「账号未绑主人算别人账号」兜底）。
 */
export function selectGrowthReports(
  input: Omit<PersonGrowthInput, "snapshots">,
): CollaborationReport[] {
  const accountsById = accountMap(input.accounts);
  const start = growthWindowStart(input.today);
  return input.reports.filter(
    (row) =>
      getCollaborationWorkDate(row) >= start &&
      getCollaborationWorkDate(row) <= input.today &&
      isGrowthRoleMatch(row, input.targetUserId, input.role, accountsById),
  );
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
    reportDate: getCollaborationWorkDate(row),
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

export function countHits(rows: CollaborationReport[], historyRows = rows): number {
  const byAccount = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const row of historyRows.filter(hasPlayCount)) {
    const bucket = byAccount.get(row.account_id) ?? [];
    bucket.push(row);
    byAccount.set(row.account_id, bucket);
  }

  let hits = 0;
  for (const row of rows.filter(hasPlayCount)) {
    const rowWorkDate = getCollaborationWorkDate(row);
    const play = asCount(row.play_count);
    if (play < 30000) continue;
    const prior = (byAccount.get(row.account_id) ?? [])
      .filter((candidate) => candidate.id !== row.id && (
        getCollaborationWorkDate(candidate) < rowWorkDate
        || (getCollaborationWorkDate(candidate) === rowWorkDate && candidate.id < row.id)
      ))
      .sort((a, b) => getCollaborationWorkDate(b).localeCompare(getCollaborationWorkDate(a)) || b.id.localeCompare(a.id))
      .slice(0, 5);
    if (prior.length < 3) continue;
    const priorMean = prior.reduce((sum, candidate) => sum + asCount(candidate.play_count), 0) / prior.length;
    if (priorMean > 0 && play >= priorMean * 3) hits++;
  }
  return hits;
}

export function monthOverMonth(currentTotal: number, previousRows: CollaborationReport[]) {
  if (previousRows.length === 0) return null;
  const previousTotal = previousRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
  if (previousTotal <= 0) return null;
  return (currentTotal - previousTotal) / previousTotal;
}
/**
 * 按快照聚合绩效：先加总再相除（加权口径）；未同步作品只计入 reportCount。
 *
 * [口径同源] 这里的比率定义与 `@/lib/video-metrics.ts`（interactionRate /
 * followerConversionRate / likeRate / favoriteRate）同式，改一处必须同步另一处。
 * 唯一差异：本函数是「先加总再相除」的聚合口径，video-metrics 是单条视频口径。
 */
export function buildPerformanceMetrics(
  rows: CollaborationReport[],
  snapshots: Map<string, VideoSnapshotMetrics>,
): WorkGroupPerformanceMetrics {
  let snapshotCount = 0;
  let totalPlay = 0;
  let followerGain = 0;
  let likes = 0;
  let comments = 0;
  let shares = 0;
  let favorites = 0;
  for (const row of rows) {
    const snapshot = row.video_id ? snapshots.get(row.video_id) : undefined;
    if (!snapshot) continue;
    snapshotCount += 1;
    totalPlay += asCount(snapshot.playCount);
    followerGain += asCount(snapshot.followerGain);
    likes += asCount(snapshot.likes);
    comments += asCount(snapshot.comments);
    shares += asCount(snapshot.shares);
    favorites += asCount(snapshot.favorites);
  }
  return {
    reportCount: rows.length,
    snapshotCount,
    totalPlay,
    avgPlay: snapshotCount > 0 ? Math.floor(totalPlay / snapshotCount) : 0,
    followerConversionRate: totalPlay > 0 ? followerGain / totalPlay : null,
    interactionRate: totalPlay > 0 ? (likes + comments + shares + favorites) / totalPlay : null,
    likeRate: totalPlay > 0 ? likes / totalPlay : null,
    favoriteRate: totalPlay > 0 ? favorites / totalPlay : null,
  };
}
