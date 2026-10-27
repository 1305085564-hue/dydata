import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { VideoMetricsSnapshot } from "@/types";
import { getPublishedDateKey } from "@/lib/date-semantics";
import {
  DEFAULT_CONTENT_LIST_FILTERS,
  type ContentListFilterValue,
} from "../content/content-list-filters";

export type PulseVideoRow = AdminContentPageData["videos"][number];

export interface PulseDayPoint {
  date: string;
  totalPlay: number | null;
  worksCount: number;
}

export interface PulseSummary {
  date: string;
  totalPlay: number | null;
  dayOverDayRate: number | null;
  worksCount: number;
  series: PulseDayPoint[];
}

export interface PulseMemberRow {
  userId: string;
  userName: string;
  publishedCount: number;
  totalPlay: number | null;
  avgBounce2s: number | null;
  avgCompletion5s: number | null;
  videos: PulseVideoRow[];
}

export interface PulseVideoMetrics {
  playCount: number | null;
  bounceRate2s: number | null;
  completionRate5s: number | null;
}

export type PulseCap = "all" | "hot" | "anomaly" | "unrated";
export type PulseMemberSortField =
  | "publishedCount"
  | "totalPlay"
  | "avgBounce2s"
  | "avgCompletion5s";
export type SortDirection = "asc" | "desc";

/** 与作品列表统一按上海发布日归属；无有效发布日的作品不进入日视图。 */
export function attributionDate(video: { published_at: string | null }): string | null {
  return getPublishedDateKey(video);
}

export function getShanghaiDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getShanghaiDateOffset(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return getShanghaiDateString(target);
}

/** shiftDay(dateStr, n) = new Date(dateStr+"T12:00:00+08:00") 加减天后用 Intl Asia/Shanghai formatToParts 取 YYYY-MM-DD */
export function shiftDay(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setDate(d.getDate() + n);
  return getShanghaiDateString(d);
}

export function parsePulseDate(raw: string | undefined, yesterday: string): string {
  // 上限锁在昨日：当天发布的作品当天没有数据回流，看今日是伪命题（手改 URL 也不放行）。
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= yesterday ? raw : yesterday;
}

export function parsePulseCap(raw: string | undefined): PulseCap {
  return raw === "hot" || raw === "anomaly" || raw === "unrated" ? raw : "all";
}

export function buildCapsuleFilters(date: string, cap: PulseCap): ContentListFilterValue {
  const base: ContentListFilterValue = {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    timeRange: "custom",
    startDate: date,
    endDate: date,
  };
  if (cap === "hot") return { ...base, qualityGrade: "excellent" }; // 爆款=综合评级"优"
  if (cap === "anomaly") return { ...base, onlyAnomaly: true }; // 内部即 classifyVideoAnomalyBucket
  if (cap === "unrated") return { ...base, qualityGrade: "unrated" }; // 复盘页现行口径：overallGrade=null 且排除 unlinked/无质量记录
  return base;
}

/**
 * 人员加权留存：weightedAvg(items:{play:number|null; value:number|null}[])：
 * 仅 play>0 且 value 有限者计入，Σ(play*value)/Σplay；分母 0 → null。
 */
export function weightedAvg(
  items: Array<{ play: number | null; value: number | null }>
): number | null {
  let totalPlay = 0;
  let weightedSum = 0;
  for (const item of items) {
    if (
      item.play != null &&
      item.play > 0 &&
      item.value != null &&
      Number.isFinite(item.value)
    ) {
      totalPlay += item.play;
      weightedSum += item.play * item.value;
    }
  }
  if (totalPlay === 0) return null;
  return weightedSum / totalPlay;
}

export function compareWithNullsLast(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: SortDirection
): number {
  const aNull = a === null || a === undefined || Number.isNaN(a);
  const bNull = b === null || b === undefined || Number.isNaN(b);
  if (aNull && bNull) return 0;
  if (aNull) return 1; // null 永远排最后（与方向无关）
  if (bNull) return -1;
  const diff = a - b;
  return direction === "asc" ? diff : -diff;
}

export function formatCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  if (absVal >= 100000000) {
    const num = (absVal / 100000000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}亿`;
  }
  if (absVal >= 10000) {
    const num = (absVal / 10000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}万`;
  }
  return val.toLocaleString("zh-CN");
}

export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}

function calculateDayTotalPlay(
  dayVideos: PulseVideoRow[],
  snapshotByVideoId: Map<string, VideoMetricsSnapshot>
): number | null {
  let hasValidSnapshot = false;
  let total = 0;
  for (const video of dayVideos) {
    const snap = snapshotByVideoId.get(video.id);
    if (snap && snap.play_count != null) {
      hasValidSnapshot = true;
      total += snap.play_count;
    }
  }
  return hasValidSnapshot ? total : null;
}

export function computePulseSummary(
  date: string,
  videos: PulseVideoRow[],
  snapshotByVideoId: Map<string, VideoMetricsSnapshot>
): PulseSummary {
  // 建立按日期划分的视频分组
  const videosByDate = new Map<string, PulseVideoRow[]>();
  for (const video of videos) {
    const d = attributionDate(video);
    if (d) {
      const list = videosByDate.get(d) ?? [];
      list.push(video);
      videosByDate.set(d, list);
    }
  }

  const curVideos = videosByDate.get(date) ?? [];
  const totalPlay = calculateDayTotalPlay(curVideos, snapshotByVideoId);
  const worksCount = curVideos.length;

  const prevDate = shiftDay(date, -1);
  const prevVideos = videosByDate.get(prevDate) ?? [];
  const prevTotalPlay = calculateDayTotalPlay(prevVideos, snapshotByVideoId);

  let dayOverDayRate: number | null = null;
  if (totalPlay != null && prevTotalPlay != null && prevTotalPlay > 0) {
    dayOverDayRate = ((totalPlay - prevTotalPlay) / prevTotalPlay) * 100;
  }

  // 30 天序列：for (i=29..0) shiftDay(date, -i)
  const series: PulseDayPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = shiftDay(date, -i);
    const dayVids = videosByDate.get(d) ?? [];
    series.push({
      date: d,
      totalPlay: calculateDayTotalPlay(dayVids, snapshotByVideoId),
      worksCount: dayVids.length,
    });
  }

  return {
    date,
    totalPlay,
    dayOverDayRate,
    worksCount,
    series,
  };
}

export function computePulseMembers(
  date: string,
  videos: PulseVideoRow[],
  snapshotByVideoId: Map<string, VideoMetricsSnapshot>,
  profiles: Array<{ id: string; name: string }>
): PulseMemberRow[] {
  const profileNameById = new Map(profiles.map((p) => [p.id, p.name]));
  const dayVideos = videos.filter((v) => attributionDate(v) === date);

  // 按归属人归类
  const memberVideosMap = new Map<string, PulseVideoRow[]>();
  for (const video of dayVideos) {
    const ownerId = video.accounts?.profile_id ?? video.user_id;
    if (!ownerId) continue;
    const list = memberVideosMap.get(ownerId) ?? [];
    list.push(video);
    memberVideosMap.set(ownerId, list);
  }

  const result: PulseMemberRow[] = [];
  for (const [userId, mVideos] of memberVideosMap.entries()) {
    const userName = profileNameById.get(userId) || "未命名成员";
    const publishedCount = mVideos.length;

    let hasPlay = false;
    let totalPlay = 0;
    const bounceItems: Array<{ play: number | null; value: number | null }> = [];
    const completionItems: Array<{ play: number | null; value: number | null }> = [];

    for (const v of mVideos) {
      const snap = snapshotByVideoId.get(v.id);
      const play = snap?.play_count ?? null;
      if (play != null) {
        hasPlay = true;
        totalPlay += play;
      }
      bounceItems.push({ play, value: snap?.bounce_rate_2s ?? null });
      completionItems.push({ play, value: snap?.completion_rate_5s ?? null });
    }

    result.push({
      userId,
      userName,
      publishedCount,
      totalPlay: hasPlay ? totalPlay : null,
      avgBounce2s: weightedAvg(bounceItems),
      avgCompletion5s: weightedAvg(completionItems),
      videos: mVideos,
    });
  }

  return result;
}
