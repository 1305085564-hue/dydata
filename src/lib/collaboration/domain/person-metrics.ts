import type { MouseHandlerDataParam } from "recharts";
import type { PersonDetailData, PersonGrowthSummary, PersonGrowthWorkItem } from "@/app/(app)/admin/collaboration/types";

export interface ChartWorkPoint {
  index: number;
  reportId: string;
  videoId: string | null;
  title: string;
  accountName: string;
  reportDate: string;
  playCount: number;
  hasSnapshot: boolean;
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
  pendingPoint: number | null;
}

/**
 * Recharts 3.x 的图表级鼠标回调只给状态（activeTooltipIndex / activeLabel），
 * 不带数据行；这里按索引→标签两级解析回作品对象，解析不出就返回 null（不猜）。
 */
export function resolveChartPoint(
  state: MouseHandlerDataParam | null | undefined,
  data: ChartWorkPoint[],
): ChartWorkPoint | null {
  if (!state || data.length === 0) return null;

  // 1. Numerical index (Recharts passes number or its string form)
  const rawIdx = state.activeTooltipIndex ?? state.activeIndex;
  if (rawIdx != null) {
    const num = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
    if (!isNaN(num) && num >= 0 && num < data.length) {
      return data[num];
    }
  }

  // 2. activeLabel (corresponds to reportId because XAxis dataKey="reportId")
  if (state.activeLabel != null) {
    const found = data.find((w) => w.reportId === state.activeLabel);
    if (found) return found;
  }

  return null;
}

export function buildGrowthChartData(
  works: PersonGrowthWorkItem[] | undefined,
): ChartWorkPoint[] {
  return (works ?? []).map((work, idx) => ({
    index: idx,
    reportId: work.reportId,
    videoId: work.videoId,
    title: work.title,
    accountName: work.accountName,
    reportDate: work.reportDate,
    playCount: work.playCount,
    hasSnapshot: work.hasSnapshot,
    interactionRate:
      work.hasSnapshot && work.interactionRate != null
        ? Number((work.interactionRate * 100).toFixed(2))
        : null,
    likeRate:
      work.hasSnapshot && work.likeRate != null
        ? Number((work.likeRate * 100).toFixed(2))
        : null,
    favoriteRate:
      work.hasSnapshot && work.favoriteRate != null
        ? Number((work.favoriteRate * 100).toFixed(2))
        : null,
    pendingPoint: !work.hasSnapshot ? 0 : null,
  }));
}

// 行情带默认态：均值口径直接取服务端加权合计（与岗位榜单、小队详情同一个数），
// 前端只做百分比换算——不在这里把每条作品的比率再平均一次。
export function buildGrowthAverages(summary: PersonGrowthSummary | null | undefined) {
  if (!summary) return null;
  const toPercent = (value: number | null) =>
    value == null ? null : Number((value * 100).toFixed(2));
  return {
    snapshotCount: summary.snapshotCount,
    avgPlay: summary.snapshotCount > 0 ? summary.avgPlay : null,
    avgInteraction: toPercent(summary.interactionRate),
    avgLike: toPercent(summary.likeRate),
    avgFavorite: toPercent(summary.favoriteRate),
  };
}

export interface SymbiosisInsight {
  topAccounts: Array<[string, number]>;
  totalWorks: number;
}

// 协同生态边注派生（Editorial #4）
export function buildSymbiosisInsight(data: PersonDetailData | null) {
  if (!data || data.records.length === 0) return null;
  const accountCounts = new Map<string, number>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const r of data.records) {
    if (r.accountName) {
      accountCounts.set(r.accountName, (accountCounts.get(r.accountName) ?? 0) + 1);
    }
  }
  const topAccounts = Array.from(accountCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  return {
    topAccounts,
    totalWorks: data.records.length,
  };
}
