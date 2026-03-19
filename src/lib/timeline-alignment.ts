import type { ContentSegment } from "./content-segmentation";

export type TimelineSegment = ContentSegment & {
  estimatedStartSec: number;
  estimatedEndSec: number;
};

const TYPE_WEIGHTS: Record<ContentSegment["type"], number> = {
  封面标题: 0.7,
  开头钩子: 1.1,
  背景铺垫: 0.95,
  核心观点: 1,
  展开论证: 1.15,
  操作建议: 1,
  CTA: 0.8,
};

function roundSeconds(value: number) {
  return Number(value.toFixed(2));
}

function calculateWeightedLength(segment: ContentSegment) {
  const textLength = segment.text.replace(/\s+/g, "").length;
  return Math.max(textLength, 1) * TYPE_WEIGHTS[segment.type];
}

export function estimateSegmentTimeline(segments: ContentSegment[], totalDurationSec: number): TimelineSegment[] {
  if (!segments.length) return [];

  const safeDuration = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : segments.length;
  const weightedLengths = segments.map(calculateWeightedLength);
  const totalWeight = weightedLengths.reduce((sum, current) => sum + current, 0) || segments.length;

  let currentSec = 0;

  return segments.map((segment, index) => {
    const estimatedStartSec = roundSeconds(currentSec);
    const duration = (weightedLengths[index] / totalWeight) * safeDuration;
    const nextSec = index === segments.length - 1 ? safeDuration : currentSec + duration;
    const estimatedEndSec = roundSeconds(nextSec);

    currentSec = nextSec;

    return {
      ...segment,
      estimatedStartSec,
      estimatedEndSec,
    };
  });
}
