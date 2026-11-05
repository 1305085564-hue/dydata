/**
 * AI 配置页列表的展示顺序：能用、在用的放上面，停用的沉到下面。
 * 只管「没有业务含义的顺序」；同一模型下渠道的排队顺序有调度含义，不经过这里。
 */
import type { AvailabilityModelFamily, BusinessAssuranceItem } from "./availability";

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

/** 先按档位（小的在前），同档按名字，再按标识兜底，保证顺序稳定。 */
export function byRankThenName<T>(rank: (item: T) => number, name: (item: T) => string, id: (item: T) => string) {
  return (a: T, b: T) => rank(a) - rank(b) || collator.compare(name(a), name(b)) || id(a).localeCompare(id(b));
}

/**
 * 按「进入时的快照」排：已在快照里的保持原位，新出现的按 compare 排在末尾。
 * 这样在页面里点开关时，刚点的那一行不会跳走。
 */
export function applyFrozenOrder<T>(items: readonly T[], frozenIds: readonly string[], id: (item: T) => string, compare: (a: T, b: T) => number): T[] {
  const position = new Map(frozenIds.map((value, index) => [value, index])); // gate:transient-map 单次排序索引，随返回释放
  const known = items.filter((item) => position.has(id(item)));
  const added = items.filter((item) => !position.has(id(item))).sort(compare);
  known.sort((a, b) => position.get(id(a))! - position.get(id(b))!);
  return [...known, ...added];
}

/** 模型卡档位：0 有业务在用 → 1 能用 → 2 开着但暂时没有能用的渠道 → 3 已停用。 */
export function compareModelFamilies(assurances: readonly BusinessAssuranceItem[]) {
  const inUse = new Set(assurances.map((item) => item.resolvedModelId).filter((value): value is string => Boolean(value)));
  return byRankThenName<AvailabilityModelFamily>(
    (family) => inUse.has(family.modelId) ? 0 : family.isSelectable ? 1 : family.isConfigured ? 2 : 3,
    (family) => family.displayName || family.modelId,
    (family) => family.modelId,
  );
}

/** 渠道列表：开着的在上，关掉的在下。 */
export const compareChannels = byRankThenName<{ id: string; label?: string | null; is_enabled: boolean }>(
  (key) => key.is_enabled ? 0 : 1,
  (key) => key.label ?? "",
  (key) => key.id,
);

/** 某条渠道的供应模型：勾选的在上，没勾的在下。 */
export const compareChannelModels = byRankThenName<{ id: string; model_id: string; display_name?: string | null; is_enabled: boolean }>(
  (model) => model.is_enabled ? 0 : 1,
  (model) => model.display_name || model.model_id,
  (model) => model.id,
);

/** 选模型下拉框：能选的在上，不能选的在下。 */
export const compareSelectableModels = byRankThenName<{ id: string; displayName: string; isSelectable: boolean }>(
  (option) => option.isSelectable ? 0 : 1,
  (option) => option.displayName,
  (option) => option.id,
);

/** 同步模型弹窗：本渠道在用的在上，其余在下；打开弹窗时排一次。 */
export function sortSyncGroups<T extends { displayName: string; modelIds: string[] }>(groups: readonly T[], enabledModelIds: ReadonlySet<string>): T[] {
  return [...groups].sort(byRankThenName<T>(
    (group) => group.modelIds.some((value) => enabledModelIds.has(value)) ? 0 : 1,
    (group) => group.displayName,
    (group) => group.modelIds[0] ?? "",
  ));
}
