import type { BreakoutGrade } from "@/lib/breakout-rating";
import { averagePlayOf } from "@/lib/metrics/caliber";
import { favoriteRate, interactionRate, likeRate } from "@/lib/video-metrics";
import type {
  CollaborationAccount,
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
  WorkGroupPerformanceMetrics,
} from "./types";
import {
  accountMap,
  buildPerformanceMetrics,
  getCollaborationWorkDate,
  getSixMonthRanges,
} from "./report-rules";
import { buildWorkContentQuality } from "./quality-rules";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

/** 成员主页的岗位口径（一人可多岗，作品按并集归属）。 */
export type PersonProfileRole = "talent" | "writer" | "editor" | "operator";

export type PersonProfileWork = {
  reportId: string;
  videoId: string | null;
  title: string;
  accountName: string;
  /** getCollaborationWorkDate：发布日优先，回退日报归属日。 */
  workDate: string;
  hasSnapshot: boolean;
  /** 快照播放优先；无平台快照时为 null（不回落日报 play_count，避免混口径）。 */
  playCount: number | null;
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
  /** 综合评级（buildWorkContentQuality.overallGrade）；无快照/不可算为 null。 */
  overallGrade: BreakoutGrade | null;
  /** 题材标签值，无则 null。 */
  subject: string | null;
  /** videos.anomaly_status；无视频或正常则 null。 */
  anomaly: string | null;
  roles: PersonProfileRole[];
};

export type PersonMonthSummary = WorkGroupPerformanceMetrics & {
  /** 综合评级非空的作品数（良优率分母）。 */
  ratedCount: number;
  /** 综合良优率 = 优+良 件数 ÷ 已评级件数；无评级样本为 null。 */
  goodRate: number | null;
};

export type PersonMonthTrendRow = {
  month: string;
  reportCount: number;
  avgPlay: number | null;
  goodRate: number | null;
  ratedCount: number;
};

export type PersonStrengthRow = {
  subject: string | null;
  reportCount: number;
  avgPlay: number | null;
  goodRate: number | null;
  ratedCount: number;
};

export type PersonProfileWorkInput = {
  targetUserId: string;
  rows: CollaborationReport[];
  accounts: CollaborationAccount[];
  snapshots: Map<string, VideoSnapshotMetrics>;
  topics: ContentQualityTopicContext;
  /** 每视频题材标签（video_tags.tag_dimension='题材'，每视频取第一条非空）。 */
  subjects: Map<string, string | null>;
  /** videos.anomaly_status，按 video_id 精确匹配。 */
  anomalies: Map<string, string | null>;
  evaluationStandards?: EvaluationStandards;
};

/**
 * 作品归属（并集，一人可多岗）：
 * 达人 = 账号主人；文案/剪辑/运营 = 对应署名字段。任一命中即计入该成员。
 */
function personWorkRoles(
  row: CollaborationReport,
  targetUserId: string,
  accountsById: Map<string, CollaborationAccount>,
): PersonProfileRole[] {
  const roles: PersonProfileRole[] = [];
  if (accountsById.get(row.account_id)?.profile_id === targetUserId) roles.push("talent");
  if (row.script_author_user_id === targetUserId) roles.push("writer");
  if (row.video_editor_user_id === targetUserId) roles.push("editor");
  if (row.operator_user_id === targetUserId) roles.push("operator");
  return roles;
}

/** 行数据 + 查找表 → 作品视图；比率走 video-metrics，评级走 buildWorkContentQuality，页面零计算。 */
export function buildPersonProfileWorks(input: PersonProfileWorkInput): PersonProfileWork[] {
  const accountsById = accountMap(input.accounts);
  return input.rows.map((row) => {
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
    const anomaly = row.video_id ? input.anomalies.get(row.video_id) ?? null : null;
    return {
      reportId: row.id,
      videoId: row.video_id,
      title: row.title?.trim() || "未命名作品",
      accountName: accountsById.get(row.account_id)?.name?.trim() || "未命名账号",
      workDate: getCollaborationWorkDate(row),
      hasSnapshot: Boolean(snapshot),
      playCount: snapshot ? snapshot.playCount : null,
      interactionRate: metricSnapshot ? interactionRate(metricSnapshot) : null,
      likeRate: metricSnapshot ? likeRate(metricSnapshot) : null,
      favoriteRate: metricSnapshot ? favoriteRate(metricSnapshot) : null,
      overallGrade: buildWorkContentQuality(row, snapshot, input.topics, input.evaluationStandards).overallGrade,
      subject: (row.video_id ? input.subjects.get(row.video_id) : null) ?? null,
      anomaly: anomaly && anomaly !== "正常" && anomaly !== "normal" ? anomaly : null,
      roles: personWorkRoles(row, input.targetUserId, accountsById),
    };
  });
}

export function derivePersonRoles(works: PersonProfileWork[]): Record<PersonProfileRole, boolean> {
  const roles: Record<PersonProfileRole, boolean> = {
    talent: false,
    writer: false,
    editor: false,
    operator: false,
  };
  for (const work of works) {
    for (const role of work.roles) roles[role] = true;
  }
  return roles;
}

/**
 * 分组小结：avgPlay 只用有平台快照的作品（averagePlayOf 与 buildPerformanceMetrics 同源，取整）；
 * goodRate 分母只计综合评级非空的作品（无快照不进分母），无评级样本为 null。
 */
function summarizeWorks(works: PersonProfileWork[]) {
  let ratedCount = 0;
  let goodCount = 0;
  const snapshotPlays: Array<number | null> = [];
  for (const work of works) {
    if (work.overallGrade) {
      ratedCount += 1;
      if (work.overallGrade === "优" || work.overallGrade === "良") goodCount += 1;
    }
    if (work.hasSnapshot) snapshotPlays.push(work.playCount);
  }
  return {
    reportCount: works.length,
    avgPlay: snapshotPlays.length > 0 ? averagePlayOf(snapshotPlays) : null,
    ratedCount,
    goodRate: ratedCount > 0 ? goodCount / ratedCount : null,
  };
}

/**
 * 本月成绩单。入参为本月作品/日报行（调用方按上海自然月 + getCollaborationWorkDate 切好）。
 * 汇总指标直接调 buildPerformanceMetrics（先加总再相除的加权口径），另附良优率与已评级数。
 */
export function buildMonthSummary(
  works: PersonProfileWork[],
  rows: CollaborationReport[],
  snapshots: Map<string, VideoSnapshotMetrics>,
): PersonMonthSummary {
  const workIds = new Set(works.map((work) => work.reportId));
  const monthRows = rows.filter((row) => workIds.has(row.id));
  const { ratedCount, goodRate } = summarizeWorks(works);
  return { ...buildPerformanceMetrics(monthRows, snapshots), ratedCount, goodRate };
}

/** 近 6 个月（含本月）走势，按时间升序；无作品的月份补 reportCount 0 / 其余 null 行。 */
export function buildMonthlyTrend(works: PersonProfileWork[], today: string): PersonMonthTrendRow[] {
  return getSixMonthRanges(Number(today.slice(0, 4)), Number(today.slice(5, 7))).map((range) => ({
    month: range.start.slice(0, 7),
    ...summarizeWorks(works.filter((work) => work.workDate >= range.start && work.workDate <= range.end)),
  }));
}

/** 按题材分组（null 归「未标注」组，各组作品数之和 = 总作品数）；未标注排最后，其余按作品数降序。 */
export function buildStrengths(works: PersonProfileWork[]): PersonStrengthRow[] {
  const groups = new Map<string | null, PersonProfileWork[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const work of works) {
    const bucket = groups.get(work.subject) ?? [];
    bucket.push(work);
    groups.set(work.subject, bucket);
  }
  return Array.from(groups.entries())
    .map(([subject, groupWorks]) => ({ subject, ...summarizeWorks(groupWorks) }))
    .sort((a, b) => {
      if (a.subject === null && b.subject !== null) return 1;
      if (a.subject !== null && b.subject === null) return -1;
      return b.reportCount - a.reportCount || (a.subject ?? "").localeCompare(b.subject ?? "");
    });
}

const GRADE_RANK: Record<BreakoutGrade, number> = { 优: 0, 良: 1, 普: 2, 劣: 3 };

/** 代表作：评级 优>良>普>劣>null，同级按播放降序、再按作品日期降序。 */
export function buildTopWorks(works: PersonProfileWork[], limit = 5): PersonProfileWork[] {
  return [...works]
    .sort(
      (a, b) =>
        (a.overallGrade ? GRADE_RANK[a.overallGrade] : 4) - (b.overallGrade ? GRADE_RANK[b.overallGrade] : 4) ||
        (b.playCount ?? -1) - (a.playCount ?? -1) ||
        b.workDate.localeCompare(a.workDate),
    )
    .slice(0, limit);
}

/** 异常作品：anomaly 非 null 且非「正常」，按作品日期降序。 */
export function buildRecentAnomalies(works: PersonProfileWork[]): PersonProfileWork[] {
  return works
    .filter((work) => work.anomaly != null && work.anomaly !== "正常" && work.anomaly !== "normal")
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
}
