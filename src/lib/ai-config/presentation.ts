import type { ProviderKeyHealthStatus } from "@/lib/ai/provider-routing";

/**
 * 检测明细四态的唯一文案与圆点配色真源（裁决④冻结词表）。
 * 页面不得各写一份四态词，避免同屏出现「待测／待命中」这类两本账。
 */
export const HEALTH_PRESENTATION: Record<ProviderKeyHealthStatus, { label: string; dot: string }> = {
  healthy: { label: "健康", dot: "bg-[#6FAA7D]" },
  untested: { label: "待命中", dot: "bg-[#B98A54]" },
  unhealthy: { label: "故障", dot: "bg-[#C75D5D]" },
  disabled: { label: "已停用", dot: "bg-[#A8A29E]" },
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
