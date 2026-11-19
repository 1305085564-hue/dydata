import type { AvailabilityChannel, AvailabilityModelFamily } from "@/lib/ai-config/availability";
import type { CallStatsWindow, ChannelCallStats, RecentCallFailure } from "@/lib/ai-config/call-stats-contract";
import type { ModelUsage } from "./ai-config-view";

/**
 * 「最近调用」值班表的口径与排序（方案：docs/plans/2026-11-19-AI配置异常优先重排方案.md）。
 * 成功率上色走配色规则①（红 = 异常）：近期 < 90% 红、< 98% 黄；近 1000 次只上黄。
 */

export type RateTone = "danger" | "warn" | null;

export function rateTone(win: CallStatsWindow | undefined, kind: "recent" | "recent1000"): RateTone {
  if (!win || win.calls === 0 || win.successRate === null) return null;
  if (kind === "recent" && win.successRate < 0.9) return "danger";
  if (win.successRate < 0.98) return "warn";
  return null;
}

/** 99.6% / 100%；没有调用时返回 null，由调用方说「没有调用」。 */
export function formatRate(win: CallStatsWindow | undefined): string | null {
  if (!win || win.calls === 0 || win.successRate === null) return null;
  const pct = Math.round(win.successRate * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function formatAgo(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

const FAILURE_KIND_LABEL: Record<string, string> = {
  timeout: "超时",
  rate_limit: "限流",
  quota: "额度用完",
  auth: "密钥失效",
  credentials: "密钥失效",
  model_not_found: "模型不存在",
  model_access: "模型不可用",
  network: "网络不通",
  service: "服务端出错",
  provider: "服务端出错",
  content: "返回内容不合格",
  other: "其他",
  unknown: "其他",
};

/** 错误类型说人话；后台已经给中文的原样用，不认识的也原样显示，不吞掉。 */
export function failureKindLabel(kind: string | null | undefined): string {
  if (!kind) return "其他";
  return FAILURE_KIND_LABEL[kind] ?? kind;
}

/** 渠道现有的最近失败记录（调用记录上线前也有）：只记最后一次。 */
export type ChannelFailureState = {
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
};

export type ChannelLine = {
  channel: AvailabilityChannel;
  stats: ChannelCallStats | null;
  /** 最近一次失败：调用统计优先，没有就用渠道上记的最后一次失败 */
  lastFailure: { at: string; reason: string; recoveredAfter: boolean } | null;
  consecutiveFailures: number;
  /** 这条渠道现在稳不稳：能用且近期成功率没有标红 */
  isStable: boolean;
};

export type ModelRisk = { tone: "danger" | "warn"; text: string } | null;

export type ModelCard = {
  family: AvailabilityModelFamily;
  isFallback: boolean;
  usage: ModelUsage | undefined;
  /** 业务此刻走的那条：顺位最靠前、能调度的渠道；没有就是 null */
  current: ChannelLine | null;
  backups: ChannelLine[];
  stableBackupCount: number;
  /** 整个模型的近期 / 近 1000 次（各渠道按调用次数合并） */
  recent: CallStatsWindow;
  recent1000: CallStatsWindow;
  risk: ModelRisk;
  isProblem: boolean;
};

/** 多条渠道的窗口合并：成功率按调用次数加权，平均耗时按成功次数加权。 */
export function mergeWindows(windows: readonly (CallStatsWindow | undefined)[]): CallStatsWindow {
  let calls = 0;
  let successes = 0;
  let durationTotal = 0;
  let timedSuccesses = 0;
  for (const win of windows) {
    if (!win || win.calls === 0 || win.successRate === null) continue;
    const ok = win.calls * win.successRate;
    calls += win.calls;
    successes += ok;
    if (win.avgMs !== null && ok > 0) {
      durationTotal += win.avgMs * ok;
      timedSuccesses += ok;
    }
  }
  return {
    calls,
    successRate: calls > 0 ? successes / calls : null,
    avgMs: timedSuccesses > 0 ? Math.round(durationTotal / timedSuccesses) : null,
  };
}

function toLine(
  channel: AvailabilityChannel,
  stats: ChannelCallStats | null,
  state: ChannelFailureState | undefined,
): ChannelLine {
  const statsFailure = stats?.lastFailure ?? null;
  const failureAt = statsFailure?.at ?? state?.lastFailureAt ?? null;
  const lastFailure = failureAt
    ? {
        at: failureAt,
        reason: statsFailure ? failureKindLabel(statsFailure.kind) : state?.lastErrorMessage?.trim() || "原因没记下",
        recoveredAfter: Boolean(
          state?.lastSuccessAt && new Date(state.lastSuccessAt).getTime() > new Date(failureAt).getTime(),
        ),
      }
    : null;
  return {
    channel,
    stats,
    lastFailure,
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    isStable: channel.identity === "active" && rateTone(stats?.recent, "recent") !== "danger",
  };
}

function modelRisk(current: ChannelLine | null, backups: ChannelLine[], stableBackupCount: number): ModelRisk {
  if (!current) return { tone: "danger", text: "没有能用的渠道，用它的功能会失败" };
  if (!current.isStable) {
    return stableBackupCount > 0
      ? { tone: "danger", text: "现在走的渠道在出错，备用还有能顶的" }
      : { tone: "danger", text: "现在走的渠道在出错，备用也顶不上" };
  }
  if (backups.length === 0) return { tone: "warn", text: "没有备用渠道，这条一断就没后路" };
  if (stableBackupCount === 0) return { tone: "warn", text: "备用全在出错，这条一断就没后路" };
  return null;
}

/**
 * 模型为主角（阿禅 2026-11-19：绝大多数功能跟随默认，要看的是模型稳不稳）。
 * 每个在用模型：现在走哪条、备用几条稳不稳、整体近期与近 1000 次成功率。
 * 出问题的模型排前；同等情况下默认（兜底）模型排第一。
 */
export function buildModelCards(input: {
  families: readonly AvailabilityModelFamily[];
  usage: Record<string, ModelUsage>;
  statsByKeyModelId: Record<string, ChannelCallStats>;
  failureByKeyModelId: Record<string, ChannelFailureState>;
}): ModelCard[] {
  const cards: ModelCard[] = [];
  for (const family of input.families) {
    if (!family.isShelved) continue;
    // 已停用的渠道既不在走也不算备用，留在渠道维护里
    const lines = family.channels
      .filter((channel) => channel.identity !== "disabled")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((channel) =>
        toLine(channel, input.statsByKeyModelId[channel.keyModelId] ?? null, input.failureByKeyModelId[channel.keyModelId]),
      );
    const current = lines.find((line) => line.channel.isSchedulable) ?? null;
    const backups = lines.filter((line) => line !== current);
    const stableBackupCount = backups.filter((line) => line.isStable).length;
    const risk = modelRisk(current, backups, stableBackupCount);
    const usage = input.usage[family.modelId];
    cards.push({
      family,
      isFallback: Boolean(usage?.isFallback),
      usage,
      current,
      backups,
      stableBackupCount,
      recent: mergeWindows(lines.map((line) => line.stats?.recent)),
      recent1000: mergeWindows(lines.map((line) => line.stats?.recent1000)),
      risk,
      isProblem: risk?.tone === "danger",
    });
  }
  return cards
    .map((card, index) => ({ card, index }))
    .sort(
      (a, b) =>
        Number(b.card.isProblem) - Number(a.card.isProblem) ||
        Number(b.card.isFallback) - Number(a.card.isFallback) ||
        a.index - b.index,
    )
    .map(({ card }) => card);
}

/** 模型卡上「谁在用」：默认模型说靠它的功能数，被单独选中的列功能名。 */
export function modelUsageText(usage: ModelUsage | undefined): string | null {
  if (!usage) return null;
  const n = usage.features.length;
  // 默认身份由卡片上的「默认」标签说，这里只说靠它的功能数
  if (usage.isFallback) return n > 0 ? `${n} 个功能都靠它` : null;
  if (n === 0) return null;
  return n <= 2 ? `${usage.features.join("、")} 在用` : `${usage.features.slice(0, 2).join("、")} 等 ${n} 个功能在用`;
}

export type FailureItem = {
  id: string;
  at: string;
  keyModelId: string;
  featureKey: string | null;
  reason: string;
  detail: string | null;
  /** rescued/lost/probe 来自调用记录；recovered/open 来自渠道上记的最后一次失败 */
  outcome: "rescued" | "lost" | "probe" | "recovered" | "open";
};

const FAILURE_LIST_LIMIT = 100;

/**
 * 最近失败流水：调用记录里的失败 + 渠道上已记下、但调用记录里还没有的最后一次失败。
 * 两处说的是同一件事，必须合在一处说（《效率美学》§1.5），不能上面说失败、下面说没有。
 */
export function buildFailureList(
  recorded: readonly RecentCallFailure[] | null,
  cards: readonly ModelCard[],
): FailureItem[] {
  const items: FailureItem[] = (recorded ?? []).map((f, index) => ({
    id: `r-${f.at}-${f.keyModelId}-${index}`,
    at: f.at,
    keyModelId: f.keyModelId,
    featureKey: f.featureKey,
    reason: failureKindLabel(f.kind),
    detail: f.message || null,
    outcome: f.isProbe ? "probe" : f.rescued ? "rescued" : "lost",
  }));
  const latestRecorded: Record<string, number> = {};
  for (const item of items) {
    latestRecorded[item.keyModelId] = Math.max(latestRecorded[item.keyModelId] ?? 0, Date.parse(item.at));
  }
  for (const card of cards) {
    for (const line of [card.current, ...card.backups]) {
      if (!line?.lastFailure) continue;
      const at = Date.parse(line.lastFailure.at);
      // 调用记录里已经有这条渠道同一时间或更新的失败，就不重复列
      if ((latestRecorded[line.channel.keyModelId] ?? 0) >= at - 1000) continue;
      items.push({
        id: `c-${line.channel.keyModelId}`,
        at: line.lastFailure.at,
        keyModelId: line.channel.keyModelId,
        featureKey: null,
        reason: line.lastFailure.reason,
        detail: null,
        outcome: line.lastFailure.recoveredAfter ? "recovered" : "open",
      });
    }
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, FAILURE_LIST_LIMIT);
}
