import { favoriteRate, interactionRate, likeRate } from "@/lib/video-metrics";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import type {
  CollaborationAccount,
  CollaborationProfile,
  CollaborationReport,
  CollaborationRoleTab,
  CollaborationVideo,
  WriterEligibility,
  ContentQualityTopicContext,
  PersonGrowthInput,
  PersonGrowthWorkItem,
  VideoSnapshotMetrics,
  WorkGroupPerformanceMetrics,
} from "./types";
import {
  accountMap,
  asCount,
  buildPerformanceMetrics,
  fromStatsStart,
  getCollaborationWorkDate,
  getPreviousMonthRange,
  getSixMonthRanges,
  roleList,
  selectGrowthReports,
  unique,
} from "./report-rules";
import { buildOperators } from "./role-metrics";
import {
  buildPersonWriterQuality,
  buildWorkContentQuality,
} from "./quality-rules";

function mapGrowthWorks(
  rows: CollaborationReport[],
  input: Pick<PersonGrowthInput, "targetUserId" | "accounts" | "snapshots" | "qualityTopics" | "evaluationStandards" | "role">,
): PersonGrowthWorkItem[] {
  const accountsById = accountMap(input.accounts);

  return rows
    .map((row) => {
      const snapshot = row.video_id ? input.snapshots.get(row.video_id) : undefined;
      const metricSnapshot = snapshot
        ? {
            play_count: snapshot.playCount,
            likes: snapshot.likes,
            comments: snapshot.comments,
            shares: snapshot.shares,
            favorites: snapshot.favorites,
          }
        : null;
      const playCount = snapshot?.playCount ?? row.play_count;
      return {
        reportId: row.id,
        videoId: row.video_id,
        title: row.title?.trim() || "未命名作品",
        accountName: accountsById.get(row.account_id)?.name?.trim() || "未命名账号",
        reportDate: getCollaborationWorkDate(row),
        playCount: asCount(playCount),
        roles: roleList(row, input.targetUserId),
        hasSnapshot: Boolean(snapshot),
        interactionRate: metricSnapshot ? interactionRate(metricSnapshot) : null,
        likeRate: metricSnapshot ? likeRate(metricSnapshot) : null,
        favoriteRate: metricSnapshot ? favoriteRate(metricSnapshot) : null,
        contentQuality: input.qualityTopics && (input.role === "writers" || input.role === "talents")
          ? buildWorkContentQuality(row, snapshot, input.qualityTopics, input.evaluationStandards)
          : undefined,
      };
    })
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.reportId.localeCompare(b.reportId));
}

export function buildPersonGrowthWorks(input: PersonGrowthInput): PersonGrowthWorkItem[] {
  return mapGrowthWorks(selectGrowthReports(input), input);
}

/**
 * 增长曲线的作品序列 + 行情带均值。
 *
 * [口径同源] 均值直接复用 buildPerformanceMetrics：先加总分子分母再相除，
 * 与岗位榜单、小队详情同一个数（不是单条比率的算术平均）；未同步 24h 快照的
 * 作品只计入作品数，不参与播放与比率。
 */
export function buildPersonGrowth(
  input: PersonGrowthInput,
): { works: PersonGrowthWorkItem[]; summary: WorkGroupPerformanceMetrics | null } {
  const rows = selectGrowthReports(input);
  return {
    works: mapGrowthWorks(rows, input),
    summary: rows.length > 0 ? buildPerformanceMetrics(rows, input.snapshots) : null,
  };
}
function shanghaiDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatShanghaiDateOnly(date);
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
  const byVideoId = new Map<string, string | null>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const byAccountDateTitle = new Map<string, { count: number; anomaly: string | null }>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const byAccountDate = new Map<string, { count: number; anomaly: string | null }>(); // gate:transient-map 函数内临时聚合，随调用栈释放

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
  report: Pick<CollaborationReport, "account_id" | "report_date" | "published_at" | "title" | "video_id">,
  indexes: ReturnType<typeof anomalyIndexes>,
) {
  const videoId = normalizeMatchText(report.video_id);
  if (videoId) {
    return indexes.byVideoId.has(videoId) ? indexes.byVideoId.get(videoId) ?? null : null;
  }

  const title = normalizeMatchText(report.title);
  const workDate = getCollaborationWorkDate(report);
  if (title) {
    const titleEntry = indexes.byAccountDateTitle.get(`${report.account_id}|${workDate}|${title}`);
    if (titleEntry?.count === 1) return titleEntry.anomaly;
  }

  const dateEntry = indexes.byAccountDate.get(`${report.account_id}|${workDate}`);
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
  growthRole?: CollaborationRoleTab;
  growthReports?: CollaborationReport[];
  growthSnapshots?: Map<string, VideoSnapshotMetrics>;
  currentSnapshots?: Map<string, VideoSnapshotMetrics>;
  /**
   * 达人明细的作品行：按「账号主人」归属过滤后由数据层传入（与达人榜单同源）。
   * 缺省时退回署名口径的 currentRows，不影响 currentMonth 的署名统计。
   */
  recordRows?: CollaborationReport[];
  qualityTopics?: ContentQualityTopicContext;
  evaluationStandards?: EvaluationStandards;
  today?: string;
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
  const growthToday = input.today ?? formatShanghaiDateOnly();
  const growth =
    input.growthRole && input.growthReports && input.growthSnapshots
      ? buildPersonGrowth({
          targetUserId: input.targetUserId,
          role: input.growthRole,
          reports: input.growthReports,
          accounts: input.accounts,
          snapshots: input.growthSnapshots,
          today: growthToday,
          qualityTopics: input.growthRole === "writers" || input.growthRole === "talents"
            ? input.qualityTopics
            : undefined,
          evaluationStandards: input.evaluationStandards,
        })
      : { works: [] as PersonGrowthWorkItem[], summary: null };

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
  const writerQuality = (input.growthRole === "writers" || input.growthRole === "talents") && input.qualityTopics
    ? buildPersonWriterQuality({
        targetUserId: input.targetUserId,
        role: input.growthRole,
        currentRows,
        growthRows: input.growthReports ?? [],
        accounts: input.accounts,
        snapshots: input.currentSnapshots ?? input.growthSnapshots ?? new Map(), // gate:transient-map 函数内临时聚合，随调用栈释放
        topics: input.qualityTopics,
        evaluationStandards: input.evaluationStandards,
      })
    : undefined;

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
    growthWorks: growth.works,
    growthSummary: growth.summary,
    writerQuality,
    // 达人明细用「账号主人」归属的 recordRows（数据层已按 isGrowthRoleMatch/talents 过滤），
    // 其余岗位维持署名口径的 currentRows。
    records: (input.recordRows
      ? input.recordRows.filter((row) => {
          const date = getCollaborationWorkDate(row);
          return date >= currentRange.start && date <= currentRange.end;
        })
      : currentRows)
      .map((row) => {
        const snapshot = row.video_id
          ? (input.currentSnapshots ?? input.growthSnapshots)?.get(row.video_id)
          : undefined;
        const snapshotPlay = snapshot?.playCount;
        // 展示列：平台快照播放量优先，快照缺播放量时才回落到日报填报值。
        const playCount = snapshotPlay ?? asCount(row.play_count);
        return {
          reportId: row.id,
          reportDate: getCollaborationWorkDate(row),
          accountId: row.account_id,
          accountName: input.accounts.find((account) => account.id === row.account_id)?.name?.trim() || "未命名账号",
          title: row.title,
          playCount,
          roles: roleList(row, input.targetUserId),
          dataSource: row.data_source ?? null,
          anomaly: resolveReportAnomaly(row, anomalies),
          hasSnapshot: Boolean(snapshot),
          contentQuality: input.growthRole === "talents" && input.qualityTopics
            ? buildWorkContentQuality(row, snapshot, input.qualityTopics, input.evaluationStandards)
            : undefined,
        };
      })
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.reportId.localeCompare(b.reportId)),
  };
}
