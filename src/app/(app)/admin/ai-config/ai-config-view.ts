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

export type ModelUsage = { isFallback: boolean; features: string[] };

/** 每个模型被哪些功能配置使用：指定了模型的算它，跟随默认的算默认模型；兜底职责单独记，不混进功能数。 */
export function buildModelUsage(assurances: readonly BusinessAssuranceItem[]): Record<string, ModelUsage> {
  const usage: Record<string, ModelUsage> = {};
  for (const item of assurances) {
    const isDefaultRow = item.key === DEFAULT_KEY;
    const modelId = isDefaultRow ? item.defaultModelId : item.selectedModelId ?? item.defaultModelId;
    if (!modelId) continue;
    const entry = (usage[modelId] ??= { isFallback: false, features: [] });
    if (isDefaultRow) entry.isFallback = true;
    else entry.features.push(item.label);
  }
  return usage;
}

/** 模型卡上的一句「在给谁用」：兜底永远先说，功能多了只列前两个加总数；没人用时不说。 */
export function formatModelUsage(usage: ModelUsage | undefined): string | null {
  if (!usage) return null;
  const { isFallback, features } = usage;
  const featureText =
    features.length === 0
      ? null
      : features.length <= 2
      ? `在给 ${features.join("、")} 用`
      : `在给 ${features.slice(0, 2).join("、")} 等 ${features.length} 个功能用`;
  if (isFallback) return featureText ? `兜底 · ${featureText}` : "兜底";
  return featureText;
}

/**
 * 能用的渠道条数：只算绿灯「能用」。待复测虽然仍会被调度，但页面上不算能用，
 * 筛选与模型卡统一按这个口径，不各说各的。
 */
export function usableChannelCount(family: AvailabilityModelFamily): number {
  return family.identityCounts.active;
}

/** 「要处理」筛选：在用的模型里，有渠道要你处理，或者没有一条能用的渠道。 */
export function familyNeedsAction(family: AvailabilityModelFamily): boolean {
  return family.isShelved && (family.identityCounts.invalid > 0 || usableChannelCount(family) === 0);
}

/** 是否该把「为此模型找渠道」摆成带字按钮：在用且能用的渠道不到两条。 */
export function familyNeedsMoreChannels(family: AvailabilityModelFamily): boolean {
  return family.isShelved && usableChannelCount(family) <= 1;
}

/** 模型卡在页面里的定位属性；模型标识里可能有斜杠，用属性选择器而不是 id。 */
export const MODEL_CARD_ATTR = "data-model-card";
