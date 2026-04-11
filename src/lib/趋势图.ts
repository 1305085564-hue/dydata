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
        teamP70Score: team?.score ?? null,
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
        teamP70Score: team?.score ?? null,
      };
    }),
  };
}
