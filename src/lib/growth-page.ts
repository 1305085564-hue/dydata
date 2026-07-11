import { calcInteractionScore, calcRates, parsePercentText, type MetricsAccount, type MetricsReport } from "./metrics";

export type SampleSignal = "red" | "yellow" | "green";
export type RatingTone = "success" | "warning" | "danger" | "neutral";

export type StatusCardItem = {
  label: string;
  value: number;
  valueText: string;
  delta?: number;
  deltaText?: string;
  compact?: boolean;
  precision?: number;
  suffix?: string;
};

export type GrowthDimensionCard = {
  key: string;
  name: string;
  metricLabel: string;
  metricValue: number;
  metricText: string;
  rating: {
    label: "强" | "中" | "弱";
    tone: RatingTone;
  };
  sample: {
    count: number;
    label: string;
    signal: SampleSignal;
    hint: string;
  };
};

export type WeakBenchmarkCard = {
  dimension: string;
  state: "benchmark" | "self_best" | "empty";
  headline: string;
  personName: string;
  metricLabel: string;
  metricText: string;
  snippet: string;
  historyTopSamples: Array<{ id: string; title: string; metricText: string }>;
};

export type ScriptSegmentItem = {
  id: string;
  segmentType: "hook" | "background" | "core_point" | "action_cta" | "closing";
  content: string;
  startSec?: number | null;
  endSec?: number | null;
};

export type ScriptBreakdownData =
  | {
      state: "structured";
      rawText: string;
      placeholder: string;
      segments: Array<ScriptSegmentItem & { label: string; tone: string }>;
    }
  | {
      state: "fallback" | "empty";
      rawText: string;
      placeholder: string;
      segments: Array<ScriptSegmentItem & { label: string; tone: string }>;
    };

export type AdviceSections = {
  source: "ai" | "rule" | "error";
  diagnosis: string;
  reference: string;
  action: string;
};

export type GrowthPkRow = {
  key: string;
  label: string;
  leftValue: number;
  rightValue: number;
  leftText: string;
  rightText: string;
  gapPercent: number;
  isDanger: boolean;
  insight: string;
};

export const GROWTH_DIMENSION_RULES = [
  {
    key: "hook",
    name: "开头留人",
    metricLabel: "5秒完播率",
    unit: "%",
    higherIsBetter: true,
    diagnosisTail: "开头没有尽快给出继续看的理由。",
    prescription: "下一条开头 3 秒先抛冲突或结果，别先讲背景。",
  },
  {
    key: "mid_bounce",
    name: "中段跳出",
    metricLabel: "中段流失率",
    unit: "%",
    higherIsBetter: false,
    diagnosisTail: "进入正文后信息承接不够紧。",
    prescription: "下一条砍掉重复铺垫，中段每 8 秒补一个新信息或转折。",
  },
  {
    key: "completion",
    name: "整体完播",
    metricLabel: "完播率",
    unit: "%",
    higherIsBetter: true,
    diagnosisTail: "内容节奏或信息密度还不足以把人留到结尾。",
    prescription: "下一条把结论前置到前 10 秒，中段只保留一个核心转折。",
  },
  {
    key: "growth",
    name: "增长转化",
    metricLabel: "涨粉率",
    unit: "%",
    higherIsBetter: true,
    diagnosisTail: "看完后缺少明确的关注理由。",
    prescription: "下一条结尾固定一句关注理由，口播和字幕同时出现，别只说空泛 CTA。",
  },
  {
    key: "interaction",
    name: "互动吸引",
    metricLabel: "综合互动率",
    unit: "%",
    higherIsBetter: true,
    diagnosisTail: "内容还没有给用户足够强的表达和参与冲动。",
    prescription: "下一条在情绪最高点插一句二选一提问，让用户明确表态。",
  },
  {
    key: "topic",
    name: "话题爆点",
    metricLabel: "平均播放量",
    unit: "次",
    higherIsBetter: true,
    diagnosisTail: "当前选题拿到的分发低于团队常态。",
    prescription: "下一条沿用团队高播放题材做一个新角度，标题前 5 个字直接写结果。",
  },
] as const;

type GrowthDimensionRule = (typeof GROWTH_DIMENSION_RULES)[number];
export type GrowthDimensionName = GrowthDimensionRule["name"];
export type GrowthRating = "strong" | "mid" | "weak";
export type GrowthCredibilityLevel = "low" | "mid" | "high";

export type GrowthCredibility = {
  level: GrowthCredibilityLevel;
  label: string;
  sampleCount: number;
};

export type GrowthRadarItem = {
  dimension: GrowthDimensionName;
  self: number;
  teamAvg: number;
  rating: GrowthRating;
};

export type GrowthVerdict = {
  weakestDimension: GrowthDimensionName;
  diagnosis: string;
  prescription: string;
  source: "rule" | "ai";
  metric: {
    self: number;
    teamAvg: number;
    unit: string;
  };
};

export type GrowthBenchmark = {
  state: "ok" | "fallback_team_avg" | "none";
  peer?: {
    name: string;
    dimensionValue: number;
    scriptSnippet: string;
  };
  teamAvg?: number;
};

export type GrowthScriptBreakdownContract =
  | {
      state: "ok";
      segments: Array<{ type: ScriptSegmentItem["segmentType"]; order: number; content: string }>;
    }
  | { state: "none" };

export type GrowthPageContract = {
  identity: { profileName: string; accountCount: number; reportCount: number };
  credibility: GrowthCredibility;
  verdict: GrowthVerdict | null;
  radar: GrowthRadarItem[];
  metricsOverview: Array<{ label: string; value: number; trend: number | null; unit: string }>;
  benchmark: GrowthBenchmark;
  scriptBreakdown: GrowthScriptBreakdownContract;
  trend: Array<{
    date: string;
    playCount: number;
    followerGain: number;
    completionRate5s: number;
    completionRate: number;
  }>;
  emptyState: { isEmpty: boolean; reason?: string };
};

type GrowthAnalysisReport = MetricsReport & { content?: string | null; submitter?: string };

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatCompactCount(value: number) {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString("zh-CN");
}

function getSampleSignal(count: number): SampleSignal {
  if (count < 10) return "red";
  if (count < 30) return "yellow";
  return "green";
}

function getSampleHint(count: number) {
  if (count < 10) return "样本不足，结论仅供参考";
  if (count < 30) return "样本继续累积中，可先结合近期作品观察";
  return "样本充足，可作为稳定判断依据";
}

function getRatingByRatio(ratio: number) {
  if (ratio >= 1.1) return { label: "强" as const, tone: "success" as const };
  if (ratio <= 0.9) return { label: "弱" as const, tone: "danger" as const };
  return { label: "中" as const, tone: "warning" as const };
}

function getContractRating(ratio: number): GrowthRating {
  if (ratio >= 1.1) return "strong";
  if (ratio <= 0.9) return "weak";
  return "mid";
}

function getComparisonRatio(selfValue: number, teamValue: number, higherIsBetter: boolean) {
  if (teamValue <= 0) {
    if (selfValue <= 0) return 1;
    return higherIsBetter ? 1.1 : 0;
  }

  if (higherIsBetter) return selfValue / teamValue;
  if (selfValue <= 0) return 1.1;
  return teamValue / selfValue;
}

function getDimensionValues(myReports: MetricsReport[], teamReports: MetricsReport[]) {
  const myRates = myReports.map((report) => calcRates(report));
  const teamRates = teamReports.map((report) => calcRates(report));

  const myHook = average(myReports.map((report) => parsePercentText(report.completion_rate_5s)));
  const teamHook = average(teamReports.map((report) => parsePercentText(report.completion_rate_5s)));
  const myCompletion = average(myReports.map((report) => parsePercentText(report.completion_rate)));
  const teamCompletion = average(teamReports.map((report) => parsePercentText(report.completion_rate)));
  const myMidBounce = Math.max(myHook - myCompletion, 0);
  const teamMidBounce = Math.max(teamHook - teamCompletion, 0);
  const myGrowth = average(myRates.map((rate) => rate.followerRate));
  const teamGrowth = average(teamRates.map((rate) => rate.followerRate));
  const myInteraction = average(
    myReports.map((report) => {
      const playCount = Math.max(safeNumber(report.play_count), 1);
      return (calcInteractionScore(safeNumber(report.likes), safeNumber(report.comments), safeNumber(report.shares), safeNumber(report.favorites)) / playCount) * 100;
    }),
  );
  const teamInteraction = average(
    teamReports.map((report) => {
      const playCount = Math.max(safeNumber(report.play_count), 1);
      return (calcInteractionScore(safeNumber(report.likes), safeNumber(report.comments), safeNumber(report.shares), safeNumber(report.favorites)) / playCount) * 100;
    }),
  );
  const myTopic = average(myReports.map((report) => safeNumber(report.play_count)));
  const teamTopic = average(teamReports.map((report) => safeNumber(report.play_count)));

  const buildValue = (rule: GrowthDimensionRule, value: number, baseline: number, metricText: string) => ({
    value,
    baseline,
    metricText,
    ratio: getComparisonRatio(value, baseline, rule.higherIsBetter),
  });

  return {
    开头留人: buildValue(GROWTH_DIMENSION_RULES[0], myHook, teamHook, formatPercent(myHook)),
    中段跳出: buildValue(GROWTH_DIMENSION_RULES[1], myMidBounce, teamMidBounce, formatPercent(myMidBounce)),
    整体完播: buildValue(GROWTH_DIMENSION_RULES[2], myCompletion, teamCompletion, formatPercent(myCompletion)),
    增长转化: buildValue(GROWTH_DIMENSION_RULES[3], myGrowth, teamGrowth, formatPercent(myGrowth)),
    互动吸引: buildValue(GROWTH_DIMENSION_RULES[4], myInteraction, teamInteraction, formatPercent(myInteraction)),
    话题爆点: buildValue(GROWTH_DIMENSION_RULES[5], myTopic, teamTopic, formatCompactCount(myTopic)),
  };
}

export function getWeakestDimensions(myReports: MetricsReport[], teamReports: MetricsReport[]) {
  const values = getDimensionValues(myReports, teamReports);
  return Object.entries(values)
    .sort((left, right) => left[1].ratio - right[1].ratio)
    .slice(0, 2)
    .map(([name]) => name) as [string, string];
}

export function buildStatusCards(myReports: MetricsReport[], prevReports: MetricsReport[]): StatusCardItem[] {
  const totalPlay = myReports.reduce((sum, report) => sum + safeNumber(report.play_count), 0);
  const prevTotalPlay = prevReports.reduce((sum, report) => sum + safeNumber(report.play_count), 0);
  const totalFollower = myReports.reduce((sum, report) => sum + safeNumber(report.follower_gain), 0);
  const prevTotalFollower = prevReports.reduce((sum, report) => sum + safeNumber(report.follower_gain), 0);
  const avgLikeRate = average(myReports.map((report) => calcRates(report).likeRate));
  const prevAvgLikeRate = average(prevReports.map((report) => calcRates(report).likeRate));
  const avgCompletion = average(myReports.map((report) => parsePercentText(report.completion_rate)));
  const prevAvgCompletion = average(prevReports.map((report) => parsePercentText(report.completion_rate)));

  const makeDelta = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
  };

  return [
    {
      label: "发布数",
      value: myReports.length,
      valueText: String(myReports.length),
      delta: myReports.length - prevReports.length,
      deltaText: `${myReports.length - prevReports.length >= 0 ? "+" : ""}${myReports.length - prevReports.length}`,
    },
    {
      label: "总播放",
      value: totalPlay,
      valueText: formatCompactCount(totalPlay),
      delta: makeDelta(totalPlay, prevTotalPlay),
      deltaText: formatPercent(Math.abs(makeDelta(totalPlay, prevTotalPlay))),
      compact: true,
      precision: 1,
    },
    {
      label: "总涨粉",
      value: totalFollower,
      valueText: totalFollower.toLocaleString("zh-CN"),
      delta: makeDelta(totalFollower, prevTotalFollower),
      deltaText: formatPercent(Math.abs(makeDelta(totalFollower, prevTotalFollower))),
    },
    {
      label: "平均点赞率",
      value: avgLikeRate,
      valueText: formatPercent(avgLikeRate),
      delta: avgLikeRate - prevAvgLikeRate,
      deltaText: formatPercent(Math.abs(avgLikeRate - prevAvgLikeRate)),
      precision: 1,
      suffix: "%",
    },
    {
      label: "平均完播率",
      value: avgCompletion,
      valueText: formatPercent(avgCompletion),
      delta: avgCompletion - prevAvgCompletion,
      deltaText: formatPercent(Math.abs(avgCompletion - prevAvgCompletion)),
      precision: 1,
      suffix: "%",
    },
  ];
}

export function buildGrowthDimensionCards({ myReports, teamReports }: { myReports: MetricsReport[]; teamReports: MetricsReport[] }): GrowthDimensionCard[] {
  const values = getDimensionValues(myReports, teamReports);
  return GROWTH_DIMENSION_RULES.map((item, index) => {
    const dimension = values[item.name as keyof typeof values];
    const sampleCount = index < 2 ? myReports.length : teamReports.length;
    return {
      key: item.key,
      name: item.name,
      metricLabel: item.metricLabel,
      metricValue: dimension.value,
      metricText: dimension.metricText,
      rating: getRatingByRatio(dimension.ratio),
      sample: {
        count: sampleCount,
        label: `样本 ${sampleCount}`,
        signal: getSampleSignal(sampleCount),
        hint: getSampleHint(sampleCount),
      },
    };
  });
}

export function getGrowthCredibility(sampleCount: number): GrowthCredibility {
  const normalizedCount = Math.max(0, Math.trunc(sampleCount));
  if (normalizedCount < 3) {
    return { level: "low", label: "样本不足，仅供参考", sampleCount: normalizedCount };
  }
  if (normalizedCount < 10) {
    return { level: "mid", label: "样本累积中", sampleCount: normalizedCount };
  }
  return { level: "high", label: "样本充足", sampleCount: normalizedCount };
}

function getDimensionRule(name: GrowthDimensionName) {
  return GROWTH_DIMENSION_RULES.find((rule) => rule.name === name) ?? GROWTH_DIMENSION_RULES[0];
}

function formatContractMetric(value: number, unit: string) {
  if (unit === "%") return `${value.toFixed(1)}%`;
  return `${Math.round(value).toLocaleString("zh-CN")}${unit}`;
}

function buildContractBenchmark({
  weakestDimension,
  myProfileId,
  teamReports,
  scriptSegmentsByAccountId,
}: {
  weakestDimension: GrowthDimensionName;
  myProfileId: string;
  teamReports: GrowthAnalysisReport[];
  scriptSegmentsByAccountId: Map<string, Array<{ content: string }>>;
}): GrowthBenchmark {
  const peerReports = teamReports.filter((report) => report.user_id !== myProfileId);
  if (peerReports.length === 0) return { state: "none" };

  const teamValues = getDimensionValues(peerReports, peerReports);
  const teamAvg = teamValues[weakestDimension].value;
  const rule = getDimensionRule(weakestDimension);
  const reportsByProfile = new Map<string, GrowthAnalysisReport[]>();

  for (const report of peerReports) {
    const name = report.submitter?.trim();
    if (!name || name === "未知") continue;
    const current = reportsByProfile.get(report.user_id) ?? [];
    current.push(report);
    reportsByProfile.set(report.user_id, current);
  }

  const ranked = Array.from(reportsByProfile.values())
    .map((reports) => ({
      name: reports[0]?.submitter?.trim() ?? "",
      value: getDimensionValues(reports, peerReports)[weakestDimension].value,
      reports,
    }))
    .sort((left, right) => (rule.higherIsBetter ? right.value - left.value : left.value - right.value));

  const best = ranked[0];
  if (!best) return { state: "fallback_team_avg", teamAvg };

  const snippet = best.reports
    .map((report) => scriptSegmentsByAccountId.get(report.account_id)?.[0]?.content?.trim() || report.content?.trim() || "")
    .find(Boolean) ?? "";

  return {
    state: "ok",
    peer: {
      name: best.name,
      dimensionValue: best.value,
      scriptSnippet: snippet,
    },
  };
}

function getOverviewUnit(item: StatusCardItem) {
  if (item.suffix) return item.suffix;
  if (item.label === "发布数") return "条";
  if (item.label === "总涨粉") return "人";
  return "次";
}

/**
 * 个人成长页 V1 的唯一数据契约生成器。
 * 六维名称、指标、方向、评级阈值、诊断和改法只允许来自 GROWTH_DIMENSION_RULES。
 */
export function buildGrowthDataContract({
  profileName,
  accountCount,
  myProfileId,
  myReports,
  teamReports,
  scriptSegments,
  scriptSegmentsByAccountId,
}: {
  profileName: string;
  accountCount: number;
  myProfileId: string;
  myReports: GrowthAnalysisReport[];
  teamReports: GrowthAnalysisReport[];
  scriptSegments: ScriptSegmentItem[];
  scriptSegmentsByAccountId: Map<string, Array<{ content: string }>>;
}): GrowthPageContract {
  const identity = { profileName, accountCount, reportCount: myReports.length };
  const credibility = getGrowthCredibility(myReports.length);

  if (myReports.length === 0) {
    return {
      identity,
      credibility,
      verdict: null,
      radar: [],
      metricsOverview: [],
      benchmark: { state: "none" },
      scriptBreakdown: { state: "none" },
      trend: [],
      emptyState: { isEmpty: true, reason: "还没有真实日报数据" },
    };
  }

  const peerReports = teamReports.filter((report) => report.user_id !== myProfileId);
  const dimensionValues = getDimensionValues(myReports, peerReports);
  const radar: GrowthRadarItem[] = GROWTH_DIMENSION_RULES.map((rule) => {
    const value = dimensionValues[rule.name];
    return {
      dimension: rule.name,
      self: value.value,
      teamAvg: value.baseline,
      rating: getContractRating(value.ratio),
    };
  });
  const weakestDimension = [...GROWTH_DIMENSION_RULES].sort(
    (left, right) => dimensionValues[left.name].ratio - dimensionValues[right.name].ratio,
  )[0].name;
  const weakestRule = getDimensionRule(weakestDimension);
  const weakestValue = dimensionValues[weakestDimension];
  const diagnosis = peerReports.length
    ? `你的${weakestRule.metricLabel}是 ${formatContractMetric(weakestValue.value, weakestRule.unit)}，团队均值是 ${formatContractMetric(weakestValue.baseline, weakestRule.unit)}，${weakestRule.diagnosisTail}`
    : `你的${weakestRule.metricLabel}是 ${formatContractMetric(weakestValue.value, weakestRule.unit)}，团队暂无可比样本，先按真实数据继续积累。`;
  const overview = buildStatusCards(myReports, []);

  return {
    identity,
    credibility,
    verdict: {
      weakestDimension,
      diagnosis,
      prescription: weakestRule.prescription,
      source: "rule",
      metric: {
        self: weakestValue.value,
        teamAvg: weakestValue.baseline,
        unit: weakestRule.unit,
      },
    },
    radar,
    metricsOverview: overview.map((item) => ({
      label: item.label,
      value: item.value,
      trend: item.delta ?? null,
      unit: getOverviewUnit(item),
    })),
    benchmark: buildContractBenchmark({
      weakestDimension,
      myProfileId,
      teamReports: peerReports,
      scriptSegmentsByAccountId,
    }),
    scriptBreakdown:
      scriptSegments.length > 0
        ? {
            state: "ok",
            segments: scriptSegments.map((segment, index) => ({
              type: segment.segmentType,
              order: index + 1,
              content: segment.content,
            })),
          }
        : { state: "none" },
    trend: [...myReports]
      .sort((left, right) => left.report_date.localeCompare(right.report_date))
      .map((report) => ({
        date: report.report_date,
        playCount: safeNumber(report.play_count),
        followerGain: safeNumber(report.follower_gain),
        completionRate5s: parsePercentText(report.completion_rate_5s),
        completionRate: parsePercentText(report.completion_rate),
      })),
    emptyState: { isEmpty: false },
  };
}

function getAccountDimensionValue(dimension: string, reports: MetricsReport[], teamReports: MetricsReport[]) {
  const values = getDimensionValues(reports, teamReports);
  return values[dimension as keyof typeof values]?.value ?? 0;
}

function getHistoryTopSamples(myReports: MetricsReport[], dimension: string) {
  const rule = getDimensionRule(dimension as GrowthDimensionName);
  return [...myReports]
    .sort((left, right) => {
      const valueLeft = getAccountDimensionValue(dimension, [left], myReports);
      const valueRight = getAccountDimensionValue(dimension, [right], myReports);
      return rule.higherIsBetter ? valueRight - valueLeft : valueLeft - valueRight;
    })
    .slice(0, 3)
    .map((report) => ({
      id: `${report.account_id}-${report.report_date}`,
      title: `${report.report_date} 作品`,
      metricText: dimension === "话题爆点" ? formatCompactCount(safeNumber(report.play_count)) : formatPercent(getAccountDimensionValue(dimension, [report], myReports)),
    }));
}

export function buildWeakBenchmarkCards({
  weakestDimensions,
  myAccountId,
  myProfileId,
  myReports,
  teamReports,
  accounts,
  scriptSegmentsByAccountId,
}: {
  weakestDimensions: string[];
  myAccountId: string;
  myProfileId: string;
  myReports: MetricsReport[];
  teamReports: MetricsReport[];
  accounts: MetricsAccount[];
  scriptSegmentsByAccountId: Map<string, Array<{ content: string }>>;
}): WeakBenchmarkCard[] {
  const selfAccount = accounts.find((account) => account.id === myAccountId);
  const selfDirection = selfAccount?.content_direction ?? null;
  const candidates = accounts.filter(
    (account) => account.profile_id !== myProfileId && account.content_direction === selfDirection,
  );

  return weakestDimensions.map((dimension) => {
    const rule = getDimensionRule(dimension as GrowthDimensionName);
    const ranked = [
      { accountId: myAccountId, name: selfAccount?.name ?? "我", value: getAccountDimensionValue(dimension, myReports, teamReports) },
      ...candidates.map((account) => ({
        accountId: account.id,
        name: account.name,
        value: getAccountDimensionValue(
          dimension,
          teamReports.filter((report) => report.account_id === account.id),
          teamReports,
        ),
      })),
    ].sort((left, right) => (rule.higherIsBetter ? right.value - left.value : left.value - right.value));

    const best = ranked[0];
    if (!best || (rule.higherIsBetter && best.value <= 0)) {
      return {
        dimension,
        state: "empty",
        headline: "暂无可用对标数据",
        personName: "待补充",
        metricLabel: dimension,
        metricText: "--",
        snippet: "当前同团队同题材下暂无足够样本，先继续积累数据。",
        historyTopSamples: [],
      };
    }

    if (best.accountId === myAccountId) {
      return {
        dimension,
        state: "self_best",
        headline: "你已是本项最强，参考自身历史Top3",
        personName: "自己",
        metricLabel: dimension,
        metricText: dimension === "话题爆点" ? formatCompactCount(best.value) : formatPercent(best.value),
        snippet: "优先复盘自己历史表现最好的 3 条内容，提炼可复制动作。",
        historyTopSamples: getHistoryTopSamples(myReports, dimension),
      };
    }

    return {
      dimension,
      state: "benchmark",
      headline: `${dimension}弱项对标`,
      personName: best.name,
      metricLabel: dimension,
      metricText: dimension === "话题爆点" ? formatCompactCount(best.value) : formatPercent(best.value),
      snippet: scriptSegmentsByAccountId.get(best.accountId)?.[0]?.content ?? "暂无文案片段，先参考该账号近期高表现内容。",
      historyTopSamples: [],
    };
  });
}

const segmentTypeMeta = {
  hook: { label: "开头钩子", tone: "primary" },
  background: { label: "背景铺垫", tone: "warning" },
  core_point: { label: "核心观点", tone: "success" },
  action_cta: { label: "行动引导", tone: "danger" },
  closing: { label: "结尾收束", tone: "neutral" },
} as const;

export function buildScriptBreakdownData({
  rawText,
  scriptDocument,
  scriptSegments,
}: {
  rawText: string | null | undefined;
  scriptDocument: { raw_text?: string | null } | null;
  scriptSegments: ScriptSegmentItem[];
}): ScriptBreakdownData {
  if (scriptSegments.length > 0) {
    return {
      state: "structured",
      rawText: rawText ?? scriptDocument?.raw_text ?? "",
      placeholder: "",
      segments: scriptSegments.map((segment) => ({
        ...segment,
        label: segmentTypeMeta[segment.segmentType].label,
        tone: segmentTypeMeta[segment.segmentType].tone,
      })),
    };
  }

  if (rawText || scriptDocument?.raw_text) {
    return {
      state: "fallback",
      rawText: rawText ?? scriptDocument?.raw_text ?? "",
      placeholder: "AI拆解中",
      segments: [],
    };
  }

  return {
    state: "empty",
    rawText: "",
    placeholder: "暂无文案数据",
    segments: [],
  };
}

export function buildAdviceSections({
  aiInsight,
  weakestDimension,
  selfValue,
  teamValue,
}: {
  aiInsight: { result_status?: string | null; result_json?: Record<string, unknown> | null; rendered_text?: string | null } | null;
  weakestDimension: string;
  selfValue: number;
  teamValue: number;
}): AdviceSections {
  const result = aiInsight?.result_json;
  const diagnosis = typeof result?.diagnosis === "string" ? result.diagnosis : null;
  const reference = typeof result?.reference === "string" ? result.reference : null;
  const action = typeof result?.action === "string" ? result.action : null;

  if (aiInsight?.result_status === "error") {
    return {
      source: "error",
      diagnosis: "AI 分析暂时不可用",
      reference: "AI 分析暂时不可用",
      action: "AI 分析暂时不可用",
    };
  }

  if (diagnosis && reference && action) {
    return {
      source: "ai",
      diagnosis,
      reference,
      action,
    };
  }

  const diff = teamValue - selfValue;
  return {
    source: "rule",
    diagnosis: `${weakestDimension} 当前低于团队均值 ${Math.abs(diff).toFixed(1)}，先优先补这一项。`,
    reference: `参考同题材里 ${weakestDimension} 更高的样本，重点看开头结构、信息密度和互动引导。`,
    action: `下一批内容先围绕 ${weakestDimension} 做单点优化，每次只改一个变量并连续观察 3 条。`,
  };
}

export function buildPkComparisonData({
  leftName,
  rightName,
  leftReports,
  rightReports,
}: {
  leftName: string;
  rightName: string;
  leftReports: MetricsReport[];
  rightReports: MetricsReport[];
}) {
  const left = getDimensionValues(leftReports, rightReports);
  const right = getDimensionValues(rightReports, leftReports);
  const rows: GrowthPkRow[] = [
    { key: "hook", label: "开头留人", leftValue: left.开头留人.value, rightValue: right.开头留人.value, leftText: left.开头留人.metricText, rightText: right.开头留人.metricText, gapPercent: 0, isDanger: false, insight: "" },
    { key: "completion", label: "整体完播", leftValue: left.整体完播.value, rightValue: right.整体完播.value, leftText: left.整体完播.metricText, rightText: right.整体完播.metricText, gapPercent: 0, isDanger: false, insight: "" },
    { key: "growth", label: "增长转化", leftValue: left.增长转化.value, rightValue: right.增长转化.value, leftText: left.增长转化.metricText, rightText: right.增长转化.metricText, gapPercent: 0, isDanger: false, insight: "" },
    { key: "interaction", label: "互动吸引", leftValue: left.互动吸引.value, rightValue: right.互动吸引.value, leftText: left.互动吸引.metricText, rightText: right.互动吸引.metricText, gapPercent: 0, isDanger: false, insight: "" },
    { key: "topic", label: "话题爆点", leftValue: left.话题爆点.value, rightValue: right.话题爆点.value, leftText: left.话题爆点.metricText, rightText: right.话题爆点.metricText, gapPercent: 0, isDanger: false, insight: "" },
  ].map((row) => {
    const maxValue = Math.max(row.leftValue, row.rightValue, 1);
    const gapPercent = (Math.abs(row.leftValue - row.rightValue) / maxValue) * 100;
    const leftLead = row.leftValue >= row.rightValue;
    return {
      ...row,
      gapPercent,
      isDanger: gapPercent > 30,
      insight: leftLead
        ? `${leftName} 在${row.label}上领先 ${gapPercent.toFixed(1)}%，当前表现更稳。`
        : `${leftName} 在${row.label}上落后 ${gapPercent.toFixed(1)}%，建议优先补这一项。`,
    };
  });

  return { leftName, rightName, rows };
}
