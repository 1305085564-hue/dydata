import { median } from "./video-metrics";

export type SmartAlertType = "连续下滑" | "突然爆发" | "填报异常";

export type SmartAlert = {
  id: string;
  type: SmartAlertType;
  userId: string | null;
  userName: string | null;
  accountId: string | null;
  accountName: string | null;
  tag: string | null;
  evidence: string;
  suggestion: string;
  createdAt: string;
  dedupeKey: string;
};

export type AlertReport = {
  userId: string;
  userName: string;
  accountId: string | null;
  accountName: string | null;
  tag: string | null;
  reportDate: string;
  playCount: number;
};

export type AlertProfile = {
  userId: string;
  userName: string;
  status: string | null;
};

export type SteadyDeclineCandidate = {
  accountId: string;
  accountName: string;
  userId: string;
  userName: string;
  baselinePlayCount: number;
  recentReports: Array<{
    reportDate: string;
    playCount: number;
  }>;
};

export type SpikeWindowStat = {
  date: string;
  total: number;
  hits: number;
};

export type SpikeCandidate = {
  tag: string;
  recentDays: SpikeWindowStat[];
  previousDays: SpikeWindowStat[];
};

export type NoSubmissionCandidate = {
  userId: string;
  userName: string;
  missingDays: number;
};

export function createSteadyDeclineAlerts(candidates: SteadyDeclineCandidate[], now: Date = new Date()) {
  return candidates.flatMap((candidate) => {
    if (candidate.recentReports.length < 3 || candidate.baselinePlayCount <= 0) {
      return [];
    }

    const threshold = candidate.baselinePlayCount * 0.5;
    const allBelowThreshold = candidate.recentReports.every((report) => report.playCount < threshold);

    if (!allBelowThreshold) {
      return [];
    }

    const recentText = candidate.recentReports.map((report) => report.playCount).join("/");

    return [
      createAlert({
        id: `decline:${candidate.accountId}:${formatDateKey(now)}`,
        type: "连续下滑",
        userId: candidate.userId,
        userName: candidate.userName,
        accountId: candidate.accountId,
        accountName: candidate.accountName,
        tag: null,
        evidence: `近3条播放 ${recentText}，低于基线${Math.round(candidate.baselinePlayCount)}的50%`,
        suggestion: "优先复盘近3条选题、开头和发布时间，下一条先做低风险验证版。",
        createdAt: now.toISOString(),
        dedupeKey: `${candidate.accountId}:连续下滑`,
      }),
    ];
  });
}

export function createSpikeAlerts(candidates: SpikeCandidate[], now: Date = new Date()) {
  return candidates.flatMap((candidate) => {
    const recentTotal = sum(candidate.recentDays.map((day) => day.total));
    const previousTotal = sum(candidate.previousDays.map((day) => day.total));

    if (recentTotal < 3 || previousTotal < 5) {
      return [];
    }

    const recentHits = sum(candidate.recentDays.map((day) => day.hits));
    const previousHits = sum(candidate.previousDays.map((day) => day.hits));
    const recentRate = recentHits / recentTotal;
    const previousRate = previousHits / previousTotal;
    const rateGap = recentRate - previousRate;

    if (recentRate < 0.4 || rateGap < 0.3 || recentRate < previousRate * 2) {
      return [];
    }

    return [
      createAlert({
        id: `spike:${candidate.tag}:${formatDateKey(now)}`,
        type: "突然爆发",
        userId: null,
        userName: "团队",
        accountId: null,
        accountName: `题材：${candidate.tag}`,
        tag: candidate.tag,
        evidence: `近3天爆款率 ${(recentRate * 100).toFixed(0)}%，前7天 ${(previousRate * 100).toFixed(0)}%`,
        suggestion: "立即复盘该题材近期爆款样本，连续追加 2-3 条相近结构内容。",
        createdAt: now.toISOString(),
        dedupeKey: `tag:${candidate.tag}:突然爆发`,
      }),
    ];
  });
}

export function createNoSubmissionAlerts(candidates: NoSubmissionCandidate[], now: Date = new Date()) {
  return candidates.flatMap((candidate) => {
    if (candidate.missingDays < 2) {
      return [];
    }

    return [
      createAlert({
        id: `nosubmission:${candidate.userId}:${formatDateKey(now)}`,
        type: "填报异常",
        userId: candidate.userId,
        userName: candidate.userName,
        accountId: null,
        accountName: null,
        tag: null,
        evidence: `连续${candidate.missingDays}天未提交日报`,
        suggestion: "先确认是否豁免或停更，再提醒当日补交并核对账号状态。",
        createdAt: now.toISOString(),
        dedupeKey: `${candidate.userId}:填报异常`,
      }),
    ];
  });
}

export function dedupeAlerts(currentAlerts: SmartAlert[], existingAlerts: SmartAlert[], now: Date = new Date()) {
  const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const recentKeys = new Set(
    existingAlerts
      .filter((alert) => {
        const createdAt = new Date(alert.createdAt).getTime();
        return Number.isFinite(createdAt) && createdAt >= twentyFourHoursAgo;
      })
      .map((alert) => alert.dedupeKey)
  );

  return currentAlerts.filter((alert) => !recentKeys.has(alert.dedupeKey));
}

export function buildFeishuAlertCard(alerts: SmartAlert[]) {
  const elements = alerts.length
    ? alerts.map((alert) => ({
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            `**${alert.type}**`,
            `- 用户名：${alert.userName ?? "-"}`,
            `- 账号：${alert.accountName ?? "-"}`,
            `- 数据证据：${alert.evidence}`,
            `- 建议动作：${alert.suggestion}`,
          ].join("\n"),
        },
      }))
    : [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: "当前没有新的智能预警。",
          },
        },
      ];

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: "🚨 3E 智能预警" },
        template: "red",
      },
      elements,
    },
  };
}

export function generateSmartAlerts(input: {
  reports: AlertReport[];
  profiles: AlertProfile[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const steadyDeclines = createSteadyDeclineAlerts(detectSteadyDecline(input.reports), now);
  const spikes = createSpikeAlerts(detectSpike(input.reports, now), now);
  const noSubmissions = createNoSubmissionAlerts(detectNoSubmission(input.profiles, input.reports, now), now);

  return [...steadyDeclines, ...spikes, ...noSubmissions];
}

export function detectSteadyDecline(reports: AlertReport[]): SteadyDeclineCandidate[] {
  const grouped = new Map<string, AlertReport[]>();

  for (const report of reports) {
    if (!report.accountId) continue;
    const current = grouped.get(report.accountId) ?? [];
    current.push(report);
    grouped.set(report.accountId, current);
  }

  return Array.from(grouped.entries()).flatMap(([accountId, accountReports]) => {
    const sorted = [...accountReports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    const recentReports = sorted.slice(0, 3);
    const baselineSource = sorted.slice(3, 10).map((report) => report.playCount).filter((value) => value > 0);

    if (recentReports.length < 3 || baselineSource.length < 3) {
      return [];
    }

    const baselinePlayCount = sum(baselineSource) / baselineSource.length;
    const latest = recentReports[0];

    if (!latest) {
      return [];
    }

    return [
      {
        accountId,
        accountName: latest.accountName ?? "未知账号",
        userId: latest.userId,
        userName: latest.userName,
        baselinePlayCount,
        recentReports: recentReports.map((report) => ({
          reportDate: report.reportDate,
          playCount: report.playCount,
        })),
      },
    ];
  });
}

export function detectSpike(reports: AlertReport[], now: Date): SpikeCandidate[] {
  const reportsByAccount = new Map<string, AlertReport[]>();

  for (const report of reports) {
    if (!report.accountId) continue;
    const current = reportsByAccount.get(report.accountId) ?? [];
    current.push(report);
    reportsByAccount.set(report.accountId, current);
  }

  const hitReports = reports.flatMap((report) => {
    if (!report.accountId || !report.tag) {
      return [];
    }

    const accountReports = reportsByAccount.get(report.accountId) ?? [];
    const baselineMedian = median(
      accountReports
        .map((item) => item.playCount)
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    if (!baselineMedian || baselineMedian <= 0) {
      return [];
    }

    return [{
      ...report,
      isHit: report.playCount >= baselineMedian * 2,
    }];
  });

  const recentDateSet = new Set(buildDateRange(now, 0, 2));
  const previousDateSet = new Set(buildDateRange(now, 3, 9));
  const tags = new Set(hitReports.map((report) => report.tag).filter((tag): tag is string => Boolean(tag)));

  return Array.from(tags).map((tag) => {
    const tagReports = hitReports.filter((report) => report.tag === tag);

    return {
      tag,
      recentDays: summarizeDays(tagReports.filter((report) => recentDateSet.has(report.reportDate))),
      previousDays: summarizeDays(tagReports.filter((report) => previousDateSet.has(report.reportDate))),
    };
  });
}

export function detectNoSubmission(profiles: AlertProfile[], reports: AlertReport[], now: Date): NoSubmissionCandidate[] {
  const reportDatesByUser = new Map<string, Set<string>>();

  for (const report of reports) {
    const current = reportDatesByUser.get(report.userId) ?? new Set<string>();
    current.add(report.reportDate);
    reportDatesByUser.set(report.userId, current);
  }

  return profiles
    .filter((profile) => (profile.status ?? "active") === "active")
    .map((profile) => {
      const reportDates = reportDatesByUser.get(profile.userId) ?? new Set<string>();
      let missingDays = 0;

      for (const date of buildDateRange(now, 0, 6)) {
        if (reportDates.has(date)) {
          break;
        }
        missingDays += 1;
      }

      return {
        userId: profile.userId,
        userName: profile.userName,
        missingDays,
      };
    });
}

function summarizeDays(reports: Array<AlertReport & { isHit: boolean }>) {
  const dayMap = new Map<string, { total: number; hits: number }>();

  for (const report of reports) {
    const current = dayMap.get(report.reportDate) ?? { total: 0, hits: 0 };
    current.total += 1;
    current.hits += report.isHit ? 1 : 0;
    dayMap.set(report.reportDate, current);
  }

  return Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      total: value.total,
      hits: value.hits,
    }));
}

function buildDateRange(now: Date, startDaysAgo: number, endDaysAgo: number) {
  const dates: string[] = [];

  for (let offset = startDaysAgo; offset <= endDaysAgo; offset += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    dates.push(date.toISOString().split("T")[0]);
  }

  return dates;
}

function createAlert(alert: SmartAlert) {
  return alert;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 13);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
