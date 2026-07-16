import { calcInteractionScore } from "@/lib/metrics";
import type { InteractionTrendDatum } from "@/components/charts/interaction-trend";
import type { ResultTrendDatum } from "@/components/charts/result-trend";

export interface 趋势报告 {
  report_date: string;
  user_id: string;
  play_count: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
}

interface 汇总结果 {
  playCount: number;
  followerGain: number;
  score: number;
}

interface 趋势结果 {
  结果趋势: ResultTrendDatum[];
  互动趋势: InteractionTrendDatum[];
}

function toSafeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  if (p <= 0) return Math.min(...arr);
  if (p >= 100) return Math.max(...arr);
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function 汇总单日报告(reports: 趋势报告[]) {
  return reports.reduce<汇总结果>(
    (acc, report) => {
      acc.playCount += toSafeNumber(report.play_count);
      acc.followerGain += toSafeNumber(report.follower_gain);
      acc.score += calcInteractionScore(
        toSafeNumber(report.likes),
        toSafeNumber(report.comments),
        toSafeNumber(report.shares),
        toSafeNumber(report.favorites)
      );
      return acc;
    },
    { playCount: 0, followerGain: 0, score: 0 }
  );
}

function 构建团队P70映射(reports: 趋势报告[], activeUserIds: string[]) {
  const activeUserIdSet = new Set(activeUserIds);
  const byDateAndUser = new Map<string, Map<string, 趋势报告[]>>();

  for (const report of reports) {
    if (!activeUserIdSet.has(report.user_id)) continue;

    const byUser = byDateAndUser.get(report.report_date) ?? new Map<string, 趋势报告[]>();
    const userReports = byUser.get(report.user_id) ?? [];
    userReports.push(report);
    byUser.set(report.user_id, userReports);
    byDateAndUser.set(report.report_date, byUser);
  }

  const result = new Map<string, 汇总结果>();

  for (const [date, byUser] of byDateAndUser) {
    const userTotals = Array.from(byUser.values()).map((userReports) => 汇总单日报告(userReports));
    const playCounts = userTotals.map((item) => item.playCount);
    const followerGains = userTotals.map((item) => item.followerGain);
    const scores = userTotals.map((item) => item.score);

    result.set(date, {
      playCount: percentile(playCounts, 70),
      followerGain: percentile(followerGains, 70),
      score: Number(percentile(scores, 70).toFixed(2)),
    });
  }

  return result;
}

function 构建个人日汇总映射(reports: 趋势报告[]) {
  const byDate = new Map<string, 趋势报告[]>();

  for (const report of reports) {
    const items = byDate.get(report.report_date) ?? [];
    items.push(report);
    byDate.set(report.report_date, items);
  }

  return new Map(
    Array.from(byDate.entries()).map(([date, items]) => [date, 汇总单日报告(items)])
  );
}

export function getTrendAxisUpperBound(values: Array<number | null | undefined>) {
  let maxValue = 0;

  for (const value of values) {
    const safeValue = typeof value === "number" && Number.isFinite(value) ? value : null;
    if (safeValue === null) {
      continue;
    }

    maxValue = Math.max(maxValue, safeValue);
  }

  if (maxValue <= 0) {
    return 0;
  }

  if (maxValue < 1000) {
    return Math.ceil(maxValue / 100) * 100;
  }

  if (maxValue < 10000) {
    return Math.ceil(maxValue / 1000) * 1000;
  }

  return Math.ceil(maxValue / 10000) * 10000;
}

export function build个人趋势数据(
  selfReports: 趋势报告[],
  teamReports: 趋势报告[],
  activeUserIds: string[]
): 趋势结果 {
  const selfByDate = 构建个人日汇总映射(selfReports);
  const teamAverageByDate = 构建团队P70映射(teamReports, activeUserIds);
  const dates = Array.from(selfByDate.keys()).sort((a, b) => a.localeCompare(b));

  return {
    结果趋势: dates.map((date) => {
      const self = selfByDate.get(date);
      const team = teamAverageByDate.get(date);
      return {
        date,
        playCount: self?.playCount ?? null,
        playCountTeamAverage: team?.playCount ?? null,
        followerGain: self?.followerGain ?? null,
        followerGainTeamAverage: team?.followerGain ?? null,
      };
    }),
    互动趋势: dates.map((date) => {
      const self = selfByDate.get(date);
      const team = teamAverageByDate.get(date);
      return {
        date,
        score: self?.score ?? null,
        teamAverageScore: team?.score ?? null,
      };
    }),
  };
}

export function build团队趋势数据(
  teamReports: 趋势报告[],
  activeUserIds: string[]
): 趋势结果 {
  const activeUserIdSet = new Set(activeUserIds);
  const activeReports = teamReports.filter((report) => activeUserIdSet.has(report.user_id));
  const totalsByDate = 构建个人日汇总映射(activeReports);
  const teamAverageByDate = 构建团队P70映射(activeReports, activeUserIds);
  const dates = Array.from(totalsByDate.keys()).sort((a, b) => a.localeCompare(b));

  return {
    结果趋势: dates.map((date) => {
      const total = totalsByDate.get(date);
      const team = teamAverageByDate.get(date);
      return {
        date,
        playCount: total?.playCount ?? null,
        playCountTeamAverage: team?.playCount ?? null,
        followerGain: total?.followerGain ?? null,
        followerGainTeamAverage: team?.followerGain ?? null,
      };
    }),
    互动趋势: dates.map((date) => {
      const total = totalsByDate.get(date);
      const team = teamAverageByDate.get(date);
      return {
        date,
        score: total?.score ?? null,
        teamAverageScore: team?.score ?? null,
      };
    }),
  };
}


// ─── 诚实趋势图日期工具（客户端补全连续日序列用） ──────────────────

/** 日期字符串（YYYY-MM-DD）平移天数，无法解析时原样返回 */
export function 平移日期字符串(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time)) return date;
  return new Date(time + days * 86400000).toISOString().slice(0, 10);
}

/** 两个日期字符串相差天数（b - a），无法解析时返回 null */
export function 日期相差天数(a: string, b: string): number | null {
  const aTime = Date.parse(`${a}T00:00:00Z`);
  const bTime = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return null;
  return Math.round((bTime - aTime) / 86400000);
}

const 连续日期上限 = 400;

/**
 * 把稀疏日期序列补成从最早日期到 today 的连续日序列。
 * 日报是日粒度数据，补齐后类目轴的均匀排布 = 真实日期分布；
 * 缺失日在图表上表现为空档（虚线桥接 / 断流斜纹带）。
 */
export function 补全连续日期(dates: string[], today: string): string[] {
  if (!dates.length) return [];
  const start = dates.reduce((min, date) => (date < min ? date : min), today);
  const result: string[] = [];
  let current = start;
  while (current <= today && result.length < 连续日期上限) {
    result.push(current);
    current = 平移日期字符串(current, 1);
  }
  return result;
}
