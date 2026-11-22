import type { MouseHandlerDataParam } from "recharts";
import type {
  CollaborationRoleTab,
  PersonDetailData,
  PersonGrowthSummary,
  PersonGrowthWorkItem,
} from "@/lib/collaboration/types";

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

/**
 * 悬停作品去重：同一作品（reportId 相同）复用上一次的状态引用。
 * recharts 的 tooltip 内容每次渲染都会带新的 payload 对象身份；若直接 setState 新对象，
 * 会形成「渲染 → 上报新对象 → setState → 再渲染」的更新风暴（Maximum update depth exceeded）。
 */
export function pickHoveredChartWork<T extends { reportId: string }>(prev: T | null, next: T): T {
  return prev && prev.reportId === next.reportId ? prev : next;
}

/**
 * 档案头部一句话结论：这个月交了多少、播放多少、质量怎么样。
 * 「常配账号」只在给别人账号干活时出现（排除本人名下账号），本人自营号不重复说。
 */
export function buildPersonHeadline(input: {
  data: PersonDetailData;
  role: CollaborationRoleTab | undefined;
  month: number;
  ownAccountIds?: readonly string[];
}): string {
  const { data, role, month, ownAccountIds = [] } = input;
  const parts: string[] = [`${month}月`];
  const rateText = (summary: { ratedCount: number; goodExcellentRate: number | null } | null | undefined) =>
    summary && summary.ratedCount > 0 && summary.goodExcellentRate != null
      ? `良优率 ${Math.round(summary.goodExcellentRate * 100)}%`
      : null;
  const playOf = (works: ReadonlyArray<{ playCount: number | null }>) =>
    works.reduce((sum, w) => sum + (w.playCount ?? 0), 0);

  if (role === "operators") {
    const op = data.operatorSummary;
    if (!op || op.reportCount === 0) return `${month}月 · 还没有给别人账号做运营的作品`;
    parts.push(`负责 ${op.accountCount} 个账号`, `${op.reportCount} 篇`, `总播放 ${formatCompact(op.totalPlay)}`, `导粉 ${op.totalFollowerConvert.toLocaleString("zh-CN")}`);
    return parts.join(" · ");
  }

  if (role === "writers") {
    const works = data.writerQuality?.monthWorks ?? [];
    if (works.length === 0) return `${month}月 · 还没有署名文案的作品`;
    parts.push(`${works.length} 篇`, `总播放 ${formatCompact(playOf(works))}`);
    const rate = rateText(data.writerQuality?.monthSummary);
    if (rate) parts.push(rate);
  } else {
    const records = data.records;
    if (records.length === 0) return `${month}月 · 还没有作品`;
    parts.push(`${records.length} 篇`, `总播放 ${formatCompact(playOf(records))}`);
    if (role === "talents") {
      const rate = rateText(data.talentQuality?.monthSummary);
      if (rate) parts.push(rate);
    }
  }

  if (role !== "talents") {
    const own = new Set(ownAccountIds);
    const roleKey = role === "writers" ? "writer" : role === "editors" ? "editor" : null;
    const counts = new Map<string, number>(); // gate:transient-map 函数内临时聚合，随调用栈释放
    for (const record of data.records) {
      if (own.has(record.accountId) || !record.accountName) continue;
      if (roleKey && !record.roles.includes(roleKey)) continue;
      counts.set(record.accountName, (counts.get(record.accountName) ?? 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (top.length > 0) parts.push(`常配 ${top.map(([name, n]) => `${name} ${n} 篇`).join("、")}`);
  }
  return parts.join(" · ");
}

function formatCompact(value: number): string {
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
}
