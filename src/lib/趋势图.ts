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
    const playCounts = userTotals.map((item) => item.playCount).sort((a, b) => a - b);
    const followerGains = userTotals.map((item) => item.followerGain).sort((a, b) => a - b);
    const scores = userTotals.map((item) => item.score).sort((a, b) => a - b);
    const p70Index = Math.ceil(userTotals.length * 0.7) - 1;

    result.set(date, {
      playCount: playCounts[p70Index] ?? 0,
      followerGain: followerGains[p70Index] ?? 0,
      score: Number((scores[p70Index] ?? 0).toFixed(2)),
    });
  }

  return result;
}

function 构建团队日均映射(reports: 趋势报告[], activeUserIds: string[]) {
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
    const totals = Array.from(byUser.values()).reduce<汇总结果>(
      (acc, userReports) => {
        const userTotals = 汇总单日报告(userReports);
        acc.playCount += userTotals.playCount;
        acc.followerGain += userTotals.followerGain;
        acc.score += userTotals.score;
        return acc;
      },
      { playCount: 0, followerGain: 0, score: 0 }
    );

    const userCount = byUser.size;
    result.set(date, {
      playCount: userCount > 0 ? totals.playCount / userCount : 0,
      followerGain: userCount > 0 ? totals.followerGain / userCount : 0,
      score: userCount > 0 ? Number((totals.score / userCount).toFixed(2)) : 0,
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
  const teamAverageByDate = 构建团队日均映射(activeReports, activeUserIds);
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
