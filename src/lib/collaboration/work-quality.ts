export const EFFECTIVE_PLAY_THRESHOLD = 500;
export const EXCELLENT_PLAY_THRESHOLD = 30_000;
export const EXCELLENT_BILLING_BONUS = 2;

export interface WorkQualityResult {
  hasPlayData: boolean;
  isEffective: boolean;
  isExcellent: boolean;
  billingCount: number;
  billingGap: number | null;
}

/** 岗位作品质量与单条文案计费；缺失播放不能成为判断或计费依据。 */
export function getWorkQuality(
  play: number | null | undefined,
): WorkQualityResult {
  if (play == null || !Number.isFinite(play)) {
    return {
      hasPlayData: false,
      isEffective: false,
      isExcellent: false,
      billingCount: 0,
      billingGap: null,
    };
  }

  const isEffective = play > EFFECTIVE_PLAY_THRESHOLD;
  const isExcellent = play >= EXCELLENT_PLAY_THRESHOLD;
  const isBillingBase = play >= EFFECTIVE_PLAY_THRESHOLD;

  return {
    hasPlayData: true,
    isEffective,
    isExcellent,
    billingCount: (isBillingBase ? 1 : 0) + (isExcellent ? EXCELLENT_BILLING_BONUS : 0),
    billingGap: isBillingBase ? 0 : EFFECTIVE_PLAY_THRESHOLD - play,
  };
}

export function countWorkQuality(
  rows: ReadonlyArray<{ play_count: number | null | undefined }>,
) {
  let effectiveCount = 0;
  let excellentCount = 0;
  let billingCount = 0;

  for (const { play_count: play } of rows) {
    const quality = getWorkQuality(play);
    if (!quality.hasPlayData) continue;
    if (quality.isEffective) effectiveCount++;
    if (quality.isExcellent) excellentCount++;
    billingCount += quality.billingCount;
  }

  return { effectiveCount, excellentCount, billingCount };
}
