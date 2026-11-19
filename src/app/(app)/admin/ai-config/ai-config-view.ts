import type { AvailabilityModelFamily, BusinessAssuranceItem } from "@/lib/ai-config/availability";

/**
 * AI 配置页「坏了 → 去修」的连线（《效率美学》§1.3 步数就是成本）。
 * 功能表与下方模型列表之间只靠这几条规则互相指认，不另存状态。
 */

/** 功能出问题时该去修的模型：顶班 = 自己选的那个坏了；停摆 = 选的（没选就是默认）坏了。正常不需要修。 */
export function repairTargetModelId(assurance: BusinessAssuranceItem | undefined): string | null {
  if (!assurance || assurance.routingStatus === "normal") return null;
  return assurance.selectedModelId ?? assurance.defaultModelId ?? null;
}

const DEFAULT_KEY = "default";

/** 每个模型被哪些功能配置使用：指定了模型的算它，跟随默认的算默认模型；全局默认本身记为「兜底」。 */
export function buildModelUsage(assurances: readonly BusinessAssuranceItem[]): Record<string, string[]> {
  const usage: Record<string, string[]> = {};
  for (const item of assurances) {
    const modelId = item.key === DEFAULT_KEY ? item.defaultModelId : item.selectedModelId ?? item.defaultModelId;
    if (!modelId) continue;
    const label = item.key === DEFAULT_KEY ? "兜底" : item.label;
    (usage[modelId] ??= []).push(label);
  }
  return usage;
}

/** 模型卡上的一句「在给谁用」；没人用时不说。 */
export function formatModelUsage(labels: readonly string[] | undefined): string | null {
  if (!labels || labels.length === 0) return null;
  if (labels.length <= 2) return `在给 ${labels.join("、")} 用`;
  return `在给 ${labels.slice(0, 2).join("、")} 等 ${labels.length} 个功能用`;
}

/** 「要处理」筛选：在用的模型里，有渠道要你处理，或者一条能用的渠道都没有。 */
export function familyNeedsAction(family: AvailabilityModelFamily): boolean {
  return family.isShelved && (family.identityCounts.invalid > 0 || family.schedulableChannelCount === 0);
}

/** 模型卡在页面里的定位属性；模型标识里可能有斜杠，用属性选择器而不是 id。 */
export const MODEL_CARD_ATTR = "data-model-card";
