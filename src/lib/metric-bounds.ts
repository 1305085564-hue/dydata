/**
 * 指标物理边界。
 *
 * 背景：比率类指标（完播率 / 2s 跳出率 / 互动率 …）物理上不可能超过 100%。
 * 生产库里真实存在一条 `completion_rate_5s = 4773` 的脏数据，页面照原样显示成 4773.0%，
 * 还因为「按完播率找最差」被排到了榜首——复盘的依据本身不可信。
 *
 * 处理原则：
 *  - 显示：照原值打出，但必须带脏值标记（不掩盖数据问题）；
 *  - 排序：越界值视为无效（与缺数同等待遇，沉到末尾），避免脏值污染「谁最差」的判定。
 */
export const RATIO_LOWER_BOUND = 0;
export const RATIO_UPPER_BOUND = 100;

export function isImpossibleRatio(value: number | null | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  return value < RATIO_LOWER_BOUND || value > RATIO_UPPER_BOUND;
}

/** 排序/比较用：越界的比率当作缺数，不参与大小比较 */
export function toSortableRatio(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || isImpossibleRatio(value)) return null;
  return value;
}

export function describeImpossibleRatio(): string {
  return `上游数据异常：比率不应超出 ${RATIO_LOWER_BOUND}–${RATIO_UPPER_BOUND}%，此值不参与排序`;
}
