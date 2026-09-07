/** 岗位作品质量与文案月度计费；缺失播放不能成为计费依据。 */
export function countWorkQuality(rows: ReadonlyArray<{ play_count: number | null }>) {
  let effectiveCount = 0;
  let excellentCount = 0;
  let billingBase = 0;
  for (const { play_count: play } of rows) {
    if (play === null || !Number.isFinite(play)) continue;
    if (play > 500) effectiveCount++;
    if (play >= 30000) excellentCount++;
    if (play >= 500) billingBase++;
  }
  return { effectiveCount, excellentCount, billingCount: Math.max(0, billingBase + excellentCount * 2 - 25) };
}
