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

const dimensionMeta = [
  { key: "hook", name: "开头留人", metricLabel: "5秒完播率" },
  { key: "mid_bounce", name: "中段跳出", metricLabel: "中段流失率" },
  { key: "completion", name: "整体完播", metricLabel: "完播率" },
  { key: "growth", name: "增长转化", metricLabel: "涨粉率" },
  { key: "interaction", name: "互动吸引", metricLabel: "综合互动率" },
  { key: "topic", name: "话题爆点", metricLabel: "同题材播放优势" },
] as const;

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

function getRating(selfValue: number, baseline: number) {
  const ratio = baseline > 0 ? selfValue / baseline : selfValue > 0 ? 1.2 : 1;
  if (ratio >= 1.1) return { label: "强" as const, tone: "success" as const };
  if (ratio <= 0.9) return { label: "弱" as const, tone: "danger" as const };
  return { label: "中" as const, tone: "warning" as const };
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

  return {
    开头留人: { value: myHook, baseline: teamHook, metricText: formatPercent(myHook), sortValue: myHook - teamHook },
    中段跳出: { value: myMidBounce, baseline: teamMidBounce, metricText: formatPercent(myMidBounce), sortValue: teamMidBounce - myMidBounce },
    整体完播: { value: myCompletion, baseline: teamCompletion, metricText: formatPercent(myCompletion), sortValue: myCompletion - teamCompletion },
    增长转化: { value: myGrowth, baseline: teamGrowth, metricText: formatPercent(myGrowth), sortValue: myGrowth - teamGrowth },
    互动吸引: { value: myInteraction, baseline: teamInteraction, metricText: formatPercent(myInteraction), sortValue: myInteraction - teamInteraction },
    话题爆点: { value: myTopic, baseline: teamTopic, metricText: formatCompactCount(myTopic), sortValue: myTopic - teamTopic },
  };
}

export function getWeakestDimensions(myReports: MetricsReport[], teamReports: MetricsReport[]) {
  const values = getDimensionValues(myReports, teamReports);
  return Object.entries(values)
    .sort((left, right) => left[1].sortValue - right[1].sortValue)
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
  return dimensionMeta.map((item, index) => {
    const dimension = values[item.name as keyof typeof values];
    const sampleCount = index < 2 ? myReports.length : teamReports.length;
    return {
      key: item.key,
      name: item.name,
      metricLabel: item.metricLabel,
      metricValue: dimension.value,
      metricText: dimension.metricText,
      rating: getRating(dimension.value, dimension.baseline),
      sample: {
        count: sampleCount,
        label: `样本 ${sampleCount}`,
        signal: getSampleSignal(sampleCount),
        hint: getSampleHint(sampleCount),
      },
    };
  });
}

function getAccountDimensionValue(dimension: string, reports: MetricsReport[], teamReports: MetricsReport[]) {
  const values = getDimensionValues(reports, teamReports);
  return values[dimension as keyof typeof values]?.value ?? 0;
}

function getHistoryTopSamples(myReports: MetricsReport[], dimension: string) {
  return [...myReports]
    .sort((left, right) => {
      const valueLeft = getAccountDimensionValue(dimension, [left], myReports);
      const valueRight = getAccountDimensionValue(dimension, [right], myReports);
      return valueRight - valueLeft;
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
    ].sort((left, right) => right.value - left.value);

    const best = ranked[0];
    if (!best || best.value <= 0) {
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
