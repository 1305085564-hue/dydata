/**
 * 对外可解释的数据口径真源。
 * 页面文案和业务计算都从这里读取，避免规则数字漂移。
 */
export const CALIBER = {
  hitMinPlay: 30_000,
  excellentMinPlay: 30_000,
  hitTimesOverMean: 3,
  hitBaselineSize: 5,
  hitMinBaseline: 3,
  effectiveMinPlay: 2_000,
  qualityEffectiveMinPlay: 500,
  submitGraceHours: 72,
} as const;

export function averagePlayOf(values: ReadonlyArray<number | null | undefined>) {
  const effectiveValues = values.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value) && value >= CALIBER.effectiveMinPlay,
  );
  if (effectiveValues.length === 0) return 0;
  const total = effectiveValues.reduce((sum, value) => sum + value, 0);
  return Math.floor(total / effectiveValues.length);
}
