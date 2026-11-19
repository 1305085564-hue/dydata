import type { AvailabilityChannel, AvailabilityModelFamily } from "@/lib/ai-config/availability";
import type { CallStatsWindow, ChannelCallStats } from "@/lib/ai-config/call-stats-contract";
import { familyNeedsAction, type ModelUsage } from "./ai-config-view";

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

export type DutyRow = {
  channel: AvailabilityChannel;
  isFirst: boolean;
  stats: ChannelCallStats | null;
  /** 最近一次失败：调用统计优先，没有就用渠道上记的最后一次失败 */
  lastFailure: { at: string; reason: string; recoveredAfter: boolean } | null;
  consecutiveFailures: number;
  isProblem: boolean;
};

export type DutyGroup = {
  family: AvailabilityModelFamily;
  isFallback: boolean;
  usage: ModelUsage | undefined;
  rows: DutyRow[];
  isProblem: boolean;
};

function rowIsProblem(channel: AvailabilityChannel, stats: ChannelCallStats | null): boolean {
  return (
    channel.identity === "invalid" ||
    channel.identity === "sleeping" ||
    channel.identity === "retest" ||
    rateTone(stats?.recent, "recent") === "danger"
  );
}

export function buildDutyGroups(input: {
  families: readonly AvailabilityModelFamily[];
  usage: Record<string, ModelUsage>;
  statsByKeyModelId: Record<string, ChannelCallStats>;
  failureByKeyModelId: Record<string, ChannelFailureState>;
}): DutyGroup[] {
  const groups: DutyGroup[] = [];
  for (const family of input.families) {
    if (!family.isShelved) continue;
    // 已停用的渠道不值班，留在渠道维护里
    const live = family.channels
      .filter((channel) => channel.identity !== "disabled")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const rows: DutyRow[] = live.map((channel, index) => {
      const stats = input.statsByKeyModelId[channel.keyModelId] ?? null;
      const state = input.failureByKeyModelId[channel.keyModelId];
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
        isFirst: index === 0,
        stats,
        lastFailure,
        consecutiveFailures: state?.consecutiveFailures ?? 0,
        isProblem: rowIsProblem(channel, stats),
      };
    });
    const usage = input.usage[family.modelId];
    groups.push({
      family,
      isFallback: Boolean(usage?.isFallback),
      usage,
      rows,
      isProblem: familyNeedsAction(family) || rows.some((row) => row.isProblem),
    });
  }
  // 有问题的组排最前；同等情况下兜底模型排第一；其余保持原顺序。组内按真实顺位排，第一位就是首选。
  return groups
    .map((group, index) => ({ group, index }))
    .sort(
      (a, b) =>
        Number(b.group.isProblem) - Number(a.group.isProblem) ||
        Number(b.group.isFallback) - Number(a.group.isFallback) ||
        a.index - b.index,
    )
    .map(({ group }) => group);
}
