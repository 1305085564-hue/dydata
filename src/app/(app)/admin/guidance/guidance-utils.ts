import { fanConversionRate, followerConversionRate, getAccountBaseline, homepageVisitRate, median } from "@/lib/video-metrics";
import { calcRates, parsePercentText } from "@/lib/metrics";
import type { AccountTargetMode, VideoMetricsSnapshot } from "@/types";

const RECENT_WINDOW = 7;
const MIN_WINDOW_SAMPLE = 3;
const LOW_BASELINE_RATIO = 0.5;
const CONSECUTIVE_LOW_COUNT = 3;
const CULTIVATION_HIT_RATE_THRESHOLD = 0.3;
const INTERVENTION_DROP_THRESHOLD = 0.3;
const NEW_ACCOUNT_DAYS = 30;

type GuidanceAccount = {
  id: string;
  profileId: string;
  accountName: string;
  ownerName: string;
  contentDirection: string | null;
  presentationFormat: string | null;
  targetMode: AccountTargetMode | null;
  createdAt: string | null;
};

type GuidanceReport = {
  userId: string;
  accountId: string;
  reportDate: string;
  playCount: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  followerGain: number | null;
  followerConvert: number | null;
  completionRate: string | null;
  completionRate5s: string | null;
  bounceRate2s: string | null;
};

export type GuidanceInput = {
  accounts: GuidanceAccount[];
  reports: GuidanceReport[];
};

type GuidanceMetric = {
  label: string;
  value: string;
};

type GuidanceBaseItem = {
  accountId: string;
  accountName: string;
  ownerName: string;
  targetMode: AccountTargetMode | null;
  contentDirection: string | null;
  presentationFormat: string | null;
  stageLabel: string;
  formatLabel: string;
  scaleLabel: string;
  metrics: GuidanceMetric[];
  action: string;
};

export type CultivationItem = GuidanceBaseItem & {
  hitRate: number;
  liftRatio: number;
  signals: string[];
  opportunityScore: number;
};

export type InterventionItem = GuidanceBaseItem & {
  dropRatio: number | null;
  baselineRatio: number | null;
  reasons: string[];
  severityScore: number;
  latestPerformance: string;
};

export type MismatchItem = GuidanceBaseItem & {
  mismatchType: string;
  currentMode: string;
  actualPerformance: string;
  suggestion: string;
  confidenceLabel: string;
  mismatchScore: number;
};

export type GuidanceResult = {
  accountCount: number;
  cultivation: CultivationItem[];
  intervention: InterventionItem[];
  mismatch: MismatchItem[];
};

type AggregatedAccount = {
  account: GuidanceAccount;
  reports: GuidanceReport[];
  recent: GuidanceReport[];
  previous: GuidanceReport[];
  latestThree: GuidanceReport[];
  playCounts: number[];
  recentPlayCounts: number[];
  previousPlayCounts: number[];
  recentMedian: number | null;
  previousMedian: number | null;
  baselineMedian: number | null;
  baselineStrategy: "self" | "mixed" | "insufficient";
  recentHitRate: number;
  avgLikeRate: number;
  avgFollowerRate: number;
  avgFanRate: number;
  avgHomepageVisitRate: number;
  avgCompletionRate: number;
  volatility: number | null;
  latestPlayCount: number | null;
  peerKey: string;
  ageDays: number | null;
};

type PeerBenchmarks = {
  hitRateMedian: number | null;
  followerRateMedian: number | null;
  fanRateMedian: number | null;
  homepageVisitRateMedian: number | null;
  completionRateMedian: number | null;
  volatilityMedian: number | null;
};

type TeamBenchmarks = {
  teamRecentP70: number | null;
  likeRateMedian: number | null;
  followerRateMedian: number | null;
  fanRateMedian: number | null;
  homepageVisitRateMedian: number | null;
  completionRateMedian: number | null;
};

function toNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function buildSnapshot(report: GuidanceReport): VideoMetricsSnapshot {
  return {
    id: `${report.accountId}-${report.reportDate}`,
    video_id: `${report.accountId}-${report.reportDate}`,
    snapshot_type: "24h",
    play_count: toNumber(report.playCount),
    likes: toNumber(report.likes),
    comments: toNumber(report.comments),
    shares: toNumber(report.shares),
    favorites: toNumber(report.favorites),
    follower_gain: toNumber(report.followerGain),
    follower_loss: 0,
    fan_play_ratio: null,
    homepage_visits: toNumber(report.followerConvert),
    follower_convert: toNumber(report.followerConvert),
    cover_click_rate: null,
    avg_play_duration: null,
    completion_rate: parsePercentText(report.completionRate),
    bounce_rate_2s: parsePercentText(report.bounceRate2s),
    completion_rate_5s: parsePercentText(report.completionRate5s),
    avg_play_ratio: null,
    vs_previous: null,
    screenshot_urls: null,
    curve_screenshot_url: null,
    retention_screenshot_url: null,
    captured_at: new Date(`${report.reportDate}T00:00:00`).toISOString(),
  };
}

function getMedianNumber(values: Array<number | null>) {
  return median(values.filter((value): value is number => value !== null));
}

function formatPercent(value: number | null, digits = 0, withSign = false) {
  if (value === null || Number.isNaN(value)) return "—";
  const percent = value * 100;
  const prefix = withSign && percent > 0 ? "+" : "";
  return `${prefix}${percent.toFixed(digits)}%`;
}

function formatCompactNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

function formatStageLabel(ageDays: number | null) {
  if (ageDays === null) return "阶段待定";
  return ageDays <= NEW_ACCOUNT_DAYS ? "新号" : "老号";
}

function formatScaleLabel(baselineMedian: number | null) {
  if (baselineMedian === null) return "体量待定";
  if (baselineMedian >= 100000) return "高体量";
  if (baselineMedian >= 30000) return "中体量";
  return "轻体量";
}

function getAgeDays(createdAt: string | null) {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const diff = Date.now() - created.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function calcVolatility(playCounts: number[]) {
  if (playCounts.length < MIN_WINDOW_SAMPLE) return null;
  const baseMedian = median(playCounts);
  if (!baseMedian || baseMedian <= 0) return null;
  const averageAbsoluteDeviation =
    playCounts.reduce((sum, value) => sum + Math.abs(value - baseMedian), 0) / playCounts.length;
  return averageAbsoluteDeviation / baseMedian;
}

function calcP70(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.7) - 1);
  return sorted[index] ?? null;
}

function buildPeerKey(account: GuidanceAccount, baselineMedian: number | null) {
  const stage = formatStageLabel(getAgeDays(account.createdAt));
  const format = account.presentationFormat?.trim() || "未分类形式";
  const direction = account.contentDirection?.trim() || "未分类题材";
  const scale = formatScaleLabel(baselineMedian);
  return `${stage}::${direction}::${format}::${scale}`;
}

function aggregateAccount(account: GuidanceAccount, reports: GuidanceReport[], teamP70: number | null): AggregatedAccount | null {
  const sortedReports = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  const playCounts = sortedReports.map((report) => report.playCount).filter((value): value is number => value !== null);
  if (playCounts.length === 0) return null;

  const recent = sortedReports.slice(0, RECENT_WINDOW);
  const previous = sortedReports.slice(RECENT_WINDOW, RECENT_WINDOW * 2);
  const latestThree = sortedReports.slice(0, CONSECUTIVE_LOW_COUNT);
  const recentPlayCounts = recent.map((report) => report.playCount).filter((value): value is number => value !== null);
  const previousPlayCounts = previous.map((report) => report.playCount).filter((value): value is number => value !== null);
  const recentMedian = median(recentPlayCounts);
  const previousMedian = median(previousPlayCounts);
  const baseline = getAccountBaseline(playCounts, getMedianNumber(playCounts));
  const snapshots = recent.map(buildSnapshot);
  const rates = recent.map((report) => calcRates(report));
  const recentHitRate =
    teamP70 && recentPlayCounts.length > 0
      ? recentPlayCounts.filter((value) => value >= teamP70).length / recentPlayCounts.length
      : 0;
  const avgLikeRate = rates.length > 0 ? rates.reduce((sum, item) => sum + item.likeRate, 0) / rates.length / 100 : 0;
  const avgFollowerRate =
    snapshots.length > 0
      ? snapshots.reduce((sum, snapshot) => sum + (followerConversionRate(snapshot) ?? 0), 0) / snapshots.length
      : 0;
  const avgFanRate =
    snapshots.length > 0 ? snapshots.reduce((sum, snapshot) => sum + (fanConversionRate(snapshot) ?? 0), 0) / snapshots.length : 0;
  const avgHomepageVisitRate =
    snapshots.length > 0
      ? snapshots.reduce((sum, snapshot) => sum + (homepageVisitRate(snapshot) ?? 0), 0) / snapshots.length
      : 0;
  const avgCompletionRate =
    recent.length > 0 ? recent.reduce((sum, report) => sum + parsePercentText(report.completionRate), 0) / recent.length / 100 : 0;

  return {
    account,
    reports: sortedReports,
    recent,
    previous,
    latestThree,
    playCounts,
    recentPlayCounts,
    previousPlayCounts,
    recentMedian,
    previousMedian,
    baselineMedian: baseline.median,
    baselineStrategy: baseline.strategy,
    recentHitRate,
    avgLikeRate,
    avgFollowerRate,
    avgFanRate,
    avgHomepageVisitRate,
    avgCompletionRate,
    volatility: calcVolatility(playCounts.slice(0, 14)),
    latestPlayCount: sortedReports[0]?.playCount ?? null,
    peerKey: buildPeerKey(account, baseline.median),
    ageDays: getAgeDays(account.createdAt),
  };
}

function buildPeerBenchmarks(accounts: AggregatedAccount[]) {
  const map = new Map<string, PeerBenchmarks>();

  for (const account of accounts) {
    const peers = accounts.filter((item) => item.peerKey === account.peerKey);
    map.set(account.account.id, {
      hitRateMedian: getMedianNumber(peers.map((item) => item.recentHitRate)),
      followerRateMedian: getMedianNumber(peers.map((item) => item.avgFollowerRate)),
      fanRateMedian: getMedianNumber(peers.map((item) => item.avgFanRate)),
      homepageVisitRateMedian: getMedianNumber(peers.map((item) => item.avgHomepageVisitRate)),
      completionRateMedian: getMedianNumber(peers.map((item) => item.avgCompletionRate)),
      volatilityMedian: getMedianNumber(peers.map((item) => item.volatility)),
    });
  }

  return map;
}

function buildTeamBenchmarks(accounts: AggregatedAccount[]): TeamBenchmarks {
  return {
    teamRecentP70: calcP70(accounts.flatMap((item) => item.recentPlayCounts)),
    likeRateMedian: getMedianNumber(accounts.map((item) => item.avgLikeRate)),
    followerRateMedian: getMedianNumber(accounts.map((item) => item.avgFollowerRate)),
    fanRateMedian: getMedianNumber(accounts.map((item) => item.avgFanRate)),
    homepageVisitRateMedian: getMedianNumber(accounts.map((item) => item.avgHomepageVisitRate)),
    completionRateMedian: getMedianNumber(accounts.map((item) => item.avgCompletionRate)),
  };
}

function buildCultivationAction(item: AggregatedAccount) {
  if (item.avgFollowerRate > item.avgFanRate) {
    return "保持当前题材，优先放大最近高表现表达形式";
  }
  if (item.avgFanRate > 0) {
    return "保留强转化内容框架，继续验证同标签导粉动作";
  }
  return "复盘近7条高表现样本，继续测试同题材上限";
}

function buildInterventionAction(reasons: string[]) {
  if (reasons.some((reason) => reason.includes("连续3条"))) {
    return "连续低于基线，先做3条低风险验证内容并回看开头留人";
  }
  return "先停掉当前弱势打法，回看前7条有效样本并调整发布时间";
}

function buildMismatchAction(targetMode: AccountTargetMode | null) {
  if (targetMode === "导粉") return "先补强主页访问与导粉动作，再验证导粉型内容";
  if (targetMode === "稳号") return "降低题材跨度，优先收敛到稳定表现模板";
  return "先回到更容易起量的表达形式，重新验证起号打法";
}

function buildCultivationList(accounts: AggregatedAccount[], interventionIds: Set<string>) {
  const items = accounts
    .filter((item) => !interventionIds.has(item.account.id))
    .filter((item) => item.recentPlayCounts.length >= MIN_WINDOW_SAMPLE && item.previousPlayCounts.length >= MIN_WINDOW_SAMPLE)
    .filter((item) => item.recentHitRate >= CULTIVATION_HIT_RATE_THRESHOLD)
    .filter((item) => item.recentMedian !== null && item.previousMedian !== null && item.recentMedian > item.previousMedian)
    .map<CultivationItem>((item) => {
      const liftRatio =
        item.recentMedian !== null && item.previousMedian !== null && item.previousMedian > 0
          ? (item.recentMedian - item.previousMedian) / item.previousMedian
          : 0;
      const signals = [
        `爆款率 ${formatPercent(item.recentHitRate, 0)}`,
        `近7条较前7条 ${formatPercent(liftRatio, 0, true)}`,
        item.baselineStrategy === "mixed" ? "新号混合基线" : "成熟基线",
      ];
      const opportunityScore = item.recentHitRate * 100 + liftRatio * 100 + item.avgFollowerRate * 1000;

      return {
        accountId: item.account.id,
        accountName: item.account.accountName,
        ownerName: item.account.ownerName,
        targetMode: item.account.targetMode,
        contentDirection: item.account.contentDirection,
        presentationFormat: item.account.presentationFormat,
        stageLabel: formatStageLabel(item.ageDays),
        formatLabel: item.account.presentationFormat?.trim() || "形式待补充",
        scaleLabel: formatScaleLabel(item.baselineMedian),
        hitRate: item.recentHitRate,
        liftRatio,
        signals,
        opportunityScore,
        metrics: [
          { label: "爆款率", value: formatPercent(item.recentHitRate, 0) },
          { label: "进步幅度", value: formatPercent(liftRatio, 0, true) },
          { label: "近7中位数", value: formatCompactNumber(item.recentMedian) },
        ],
        action: buildCultivationAction(item),
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.hitRate - a.hitRate || a.accountName.localeCompare(b.accountName, "zh-CN"));

  return items;
}

function buildInterventionList(accounts: AggregatedAccount[]) {
  return accounts
    .filter((item) => item.recentPlayCounts.length >= MIN_WINDOW_SAMPLE || item.baselineMedian !== null)
    .map<InterventionItem | null>((item) => {
      const reasons: string[] = [];
      let dropRatio: number | null = null;

      if (item.recentMedian !== null && item.previousMedian !== null && item.previousMedian > 0) {
        dropRatio = (item.previousMedian - item.recentMedian) / item.previousMedian;
        if (dropRatio >= INTERVENTION_DROP_THRESHOLD) {
          reasons.push(`近7条较前7条下降 ${formatPercent(dropRatio, 0)}`);
        }
      }

      let baselineRatio: number | null = null;
      if (item.baselineMedian !== null && item.latestThree.length >= CONSECUTIVE_LOW_COUNT) {
        const lowThreshold = item.baselineMedian * LOW_BASELINE_RATIO;
        const recentThreePlayCounts = item.latestThree.map((report) => report.playCount).filter((value): value is number => value !== null);
        const recentThreeMedian = getMedianNumber(recentThreePlayCounts);
        baselineRatio =
          recentThreePlayCounts.length === CONSECUTIVE_LOW_COUNT && recentThreeMedian !== null
            ? recentThreeMedian / item.baselineMedian
            : null;
        if (recentThreePlayCounts.length === CONSECUTIVE_LOW_COUNT && recentThreePlayCounts.every((value) => value < lowThreshold)) {
          reasons.push("连续3条低于基线50%");
        }
      }

      if (reasons.length === 0) return null;

      const severityScore =
        (dropRatio !== null && dropRatio >= INTERVENTION_DROP_THRESHOLD ? 2 : 0) +
        (reasons.includes("连续3条低于基线50%") ? 2 : 0) +
        (dropRatio !== null && dropRatio >= 0.5 ? 1 : 0);

      return {
        accountId: item.account.id,
        accountName: item.account.accountName,
        ownerName: item.account.ownerName,
        targetMode: item.account.targetMode,
        contentDirection: item.account.contentDirection,
        presentationFormat: item.account.presentationFormat,
        stageLabel: formatStageLabel(item.ageDays),
        formatLabel: item.account.presentationFormat?.trim() || "形式待补充",
        scaleLabel: formatScaleLabel(item.baselineMedian),
        dropRatio,
        baselineRatio,
        reasons,
        severityScore,
        latestPerformance: `${formatCompactNumber(item.latestPlayCount)} / 最近3条中位 ${formatCompactNumber(getMedianNumber(item.latestThree.map((report) => report.playCount)))}`,
        metrics: [
          { label: "下滑幅度", value: formatPercent(dropRatio, 0) },
          { label: "最近表现", value: formatCompactNumber(item.latestPlayCount) },
          { label: "基线占比", value: formatPercent(baselineRatio, 0) },
        ],
        action: buildInterventionAction(reasons),
      };
    })
    .filter((item): item is InterventionItem => item !== null)
    .sort((a, b) => b.severityScore - a.severityScore || (b.dropRatio ?? 0) - (a.dropRatio ?? 0) || a.accountName.localeCompare(b.accountName, "zh-CN"));
}

function buildMismatchList(accounts: AggregatedAccount[], peerMap: Map<string, PeerBenchmarks>) {
  return accounts
    .map<MismatchItem | null>((item) => {
      const peer = peerMap.get(item.account.id);
      if (!peer || !item.account.targetMode) return null;

      let mismatchType = "";
      let actualPerformance = "";
      let confidenceLabel = "中";
      let mismatchScore = 0;

      if (item.account.targetMode === "起号") {
        const isLowPlay =
          item.recentMedian !== null && item.baselineMedian !== null && item.recentMedian < item.baselineMedian * 0.8;
        const isLowHitRate = peer.hitRateMedian !== null && item.recentHitRate < Math.max(peer.hitRateMedian * 0.7, 0.15);
        if (isLowPlay || isLowHitRate) {
          mismatchType = "起号型低迷";
          actualPerformance = `近7条中位 ${formatCompactNumber(item.recentMedian)}，爆款率 ${formatPercent(item.recentHitRate, 0)}`;
          mismatchScore = 3;
        }
      }

      if (item.account.targetMode === "导粉") {
        const peerFanRate = peer.fanRateMedian ?? 0;
        if (peerFanRate > 0 && item.avgFanRate < peerFanRate * 0.7) {
          mismatchType = "导粉型转化弱";
          actualPerformance = `导粉率 ${formatPercent(item.avgFanRate, 2)}，同组中位 ${formatPercent(peerFanRate, 2)}`;
          mismatchScore = 4;
          confidenceLabel = "高";
        }
      }

      if (item.account.targetMode === "稳号") {
        const peerVolatility = peer.volatilityMedian ?? 0;
        if (item.volatility !== null && item.volatility > Math.max(peerVolatility * 1.4, 0.6)) {
          mismatchType = "稳号型波动大";
          actualPerformance = `波动系数 ${formatPercent(item.volatility, 0)}，同组中位 ${formatPercent(peerVolatility, 0)}`;
          mismatchScore = 3;
        }
      }

      if (!mismatchType) return null;

      return {
        accountId: item.account.id,
        accountName: item.account.accountName,
        ownerName: item.account.ownerName,
        targetMode: item.account.targetMode,
        contentDirection: item.account.contentDirection,
        presentationFormat: item.account.presentationFormat,
        stageLabel: formatStageLabel(item.ageDays),
        formatLabel: item.account.presentationFormat?.trim() || "形式待补充",
        scaleLabel: formatScaleLabel(item.baselineMedian),
        mismatchType,
        currentMode: item.account.targetMode,
        actualPerformance,
        suggestion: buildMismatchAction(item.account.targetMode),
        confidenceLabel,
        mismatchScore,
        metrics: [
          { label: "当前模式", value: item.account.targetMode },
          { label: "实际表现", value: actualPerformance },
          { label: "建议调整", value: buildMismatchAction(item.account.targetMode) },
        ],
        action: buildMismatchAction(item.account.targetMode),
      };
    })
    .filter((item): item is MismatchItem => item !== null)
    .sort((a, b) => b.mismatchScore - a.mismatchScore || a.accountName.localeCompare(b.accountName, "zh-CN"));
}

export function buildGuidanceResult(input: GuidanceInput): GuidanceResult {
  const groupedReports = input.reports.reduce((map, report) => {
    const list = map.get(report.accountId) ?? [];
    list.push(report);
    map.set(report.accountId, list);
    return map;
  }, new Map<string, GuidanceReport[]>());

  const allRecentPlayCounts = Array.from(groupedReports.values())
    .flatMap((reports) => [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate)).slice(0, RECENT_WINDOW))
    .map((report) => report.playCount)
    .filter((value): value is number => value !== null);
  const teamRecentP70 = calcP70(allRecentPlayCounts);

  const aggregated = input.accounts
    .map((account) => aggregateAccount(account, groupedReports.get(account.id) ?? [], teamRecentP70))
    .filter((item): item is AggregatedAccount => item !== null);

  const peerMap = buildPeerBenchmarks(aggregated);
  buildTeamBenchmarks(aggregated);
  const intervention = buildInterventionList(aggregated);
  const cultivation = buildCultivationList(
    aggregated,
    new Set(intervention.map((item) => item.accountId)),
  );
  const mismatch = buildMismatchList(aggregated, peerMap);

  return {
    accountCount: aggregated.length,
    cultivation,
    intervention,
    mismatch,
  };
}
