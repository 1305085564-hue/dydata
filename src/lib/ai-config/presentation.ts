import type { ChannelIdentity } from "@/lib/ai/channel-governance";

/** Stable text keys consumed by the three AI configuration views. */
export const AI_CONFIG_MESSAGES = {
  "business.normal": "当前优先使用：{preferredModelName}",
  "business.fallback": "{selectedModelName} 暂时不可用，当前优先使用默认 {preferredModelName}",
  "business.outage": "停摆：无可用模型",
  "model.no_available_supply": "暂时不可用：没有能用的渠道",
  "model.single_supply": "只剩 1 条能用，建议再加一条",
  "operation.confirm_impact": "此操作会让以下业务停摆，请确认后执行",
} as const;

export type AiConfigMessageKey = keyof typeof AI_CONFIG_MESSAGES;

/**
 * 渠道五态的唯一文案、圆点与配色真源（裁决④冻结词表）。
 * 页面不得各写一份五态词，确保模型视角与渠道视角两账完全一致。
 */
export const CHANNEL_IDENTITY_PRESENTATION: Record<
  ChannelIdentity,
  { label: string; dot: string; color: string; badgeClass: string }
> = {
  active: {
    label: "正常在岗",
    dot: "bg-[#4B6B4E]",
    color: "text-[#4B6B4E]",
    badgeClass: "bg-[#4B6B4E]/10 text-[#4B6B4E]",
  },
  retest: {
    label: "待复测",
    dot: "bg-[#8A6A2F]",
    color: "text-[#8A6A2F]",
    badgeClass: "bg-[#8A6A2F]/10 text-[#8A6A2F]",
  },
  sleeping: {
    label: "休眠中",
    dot: "bg-[#78716C]",
    color: "text-[#78716C]",
    badgeClass: "bg-[#F1F1F0] text-[#78716C]",
  },
  invalid: {
    label: "已失效",
    dot: "bg-status-danger",
    color: "text-status-danger-text",
    badgeClass: "bg-status-danger/[0.10] text-status-danger-text",
  },
  disabled: {
    label: "已停用",
    dot: "bg-[#A8A29E]",
    color: "text-[#78716C]",
    badgeClass: "bg-[#F1F1F0] text-[#78716C]",
  },
};

/** Formats a latency without making sub-second requests look like whole seconds. */
export function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Maps known transport/auth/dependency failures while preserving unknown server text. */
export function matchKnownError(raw: string, objectNoun?: string): string | null {
  if (/timeout|网络|fetch failed|network/i.test(raw)) return "网络请求失败，请检查连接后重试";
  if (/auth|401|403|token/i.test(raw)) return "渠道鉴权失败，请检查 API Key 是否有效";
  if (/constraint|409|依赖/i.test(raw)) return objectNoun ? `有业务依赖此${objectNoun}，请先解绑` : "存在业务依赖，请先解绑";
  return null;
}

export function presentError(raw: string, fallback: string, objectNoun?: string): string {
  return matchKnownError(raw, objectNoun) ?? (raw || fallback);
}

/** 格式化休眠剩余倒计时（共用工具） */
export function formatSleepCountdown(sleepUntilIso?: string | null): string {
  if (!sleepUntilIso) return "即将复测";
  const t = new Date(sleepUntilIso).getTime();
  if (Number.isNaN(t)) return "即将复测";
  const diffSec = Math.floor((t - Date.now()) / 1000);
  if (diffSec <= 0) return "即将复测";
  const minutes = Math.ceil(diffSec / 60);
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `剩余 ${hours} 小时 ${remMin} 分`;
}

