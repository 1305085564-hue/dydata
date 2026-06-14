import type { YikeComplexity, YikeNature, YikeSortableCard } from "./types";

const MISSING_AREA_RANK = 999999;

export const YIKE_COMPLEXITY_RANK: Record<YikeComplexity, number> = {
  deep: 1,
  focus: 2,
  small: 3,
  quick: 4,
};

export const YIKE_NATURE_RANK: Record<YikeNature, number> = {
  task: 1,
  project: 2,
  memo: 3,
};

export function getYikeSortKey(card: Pick<YikeSortableCard, "areaSortOrder" | "complexity" | "nature">) {
  return [
    card.areaSortOrder ?? MISSING_AREA_RANK,
    YIKE_COMPLEXITY_RANK[card.complexity],
    YIKE_NATURE_RANK[card.nature],
  ] as const;
}

export function compareYikeCards(a: YikeSortableCard, b: YikeSortableCard) {
  const aKey = getYikeSortKey(a);
  const bKey = getYikeSortKey(b);

  for (let index = 0; index < aKey.length; index += 1) {
    if (aKey[index] !== bKey[index]) {
      return aKey[index] - bKey[index];
    }
  }

  const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}
