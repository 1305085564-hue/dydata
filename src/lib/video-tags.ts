import {
  TAG_ENUMS,
  VIDEO_TAG_REVIEW_DIMENSIONS,
  type TagDimension,
  type VideoTag,
  type VideoTagReviewDimension,
} from "@/types";

export { VIDEO_TAG_REVIEW_DIMENSIONS };

export type RawAiTagSuggestion = {
  tag_dimension: string;
  tag_value: string;
  confidence?: number | null;
  reason?: string | null;
};

export type NormalizedAiTagSuggestion = {
  tag_dimension: VideoTagReviewDimension;
  tag_value: string;
  confidence: number | null;
  reason: string | null;
};

export type VideoTagSelection = Record<VideoTagReviewDimension, string>;

export type VideoTagFilterValues = {
  topicTags: string[];
  formatTags: string[];
  ctaTags: string[];
};

const REVIEW_DIMENSION_SET = new Set<string>(VIDEO_TAG_REVIEW_DIMENSIONS);

function isReviewDimension(value: string): value is VideoTagReviewDimension {
  return REVIEW_DIMENSION_SET.has(value);
}

function isValidTagValue(dimension: VideoTagReviewDimension, value: string) {
  return TAG_ENUMS[dimension as TagDimension].includes(value);
}

function normalizeConfidence(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function normalizeAiTagSuggestions(
  suggestions: RawAiTagSuggestion[]
): NormalizedAiTagSuggestion[] {
  const seen = new Set<VideoTagReviewDimension>();
  const normalized: NormalizedAiTagSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (!isReviewDimension(suggestion.tag_dimension)) continue;
    if (seen.has(suggestion.tag_dimension)) continue;
    if (!isValidTagValue(suggestion.tag_dimension, suggestion.tag_value)) continue;

    seen.add(suggestion.tag_dimension);
    normalized.push({
      tag_dimension: suggestion.tag_dimension,
      tag_value: suggestion.tag_value,
      confidence: normalizeConfidence(suggestion.confidence),
      reason:
        typeof suggestion.reason === "string" && suggestion.reason.trim()
          ? suggestion.reason.trim()
          : null,
    });
  }

  return normalized;
}

export function getTagReviewStatus(confidence: number | null) {
  return confidence != null && confidence >= 0.7 ? "可信" : "待确认";
}

export function createEmptyVideoTagSelection(): VideoTagSelection {
  return {
    题材: "",
    表达形式: "",
    CTA类型: "",
  };
}

export function buildTagFilterState(tags: Pick<VideoTag, "tag_dimension" | "tag_value">[]) {
  const state = createEmptyVideoTagSelection();

  for (const tag of tags) {
    if (!isReviewDimension(tag.tag_dimension)) continue;
    state[tag.tag_dimension] = tag.tag_value;
  }

  return state;
}

export function isVideoMatchedByTagFilters(
  tags: Pick<VideoTag, "tag_dimension" | "tag_value">[],
  filters: VideoTagFilterValues
) {
  const valuesByDimension = new Map<string, Set<string>>();

  for (const tag of tags) {
    const current = valuesByDimension.get(tag.tag_dimension) ?? new Set<string>();
    current.add(tag.tag_value);
    valuesByDimension.set(tag.tag_dimension, current);
  }

  const dimensionChecks: Array<[VideoTagReviewDimension, string[]]> = [
    ["题材", filters.topicTags],
    ["表达形式", filters.formatTags],
    ["CTA类型", filters.ctaTags],
  ];

  return dimensionChecks.every(([dimension, selectedValues]) => {
    if (!selectedValues.length) return true;
    const tagValues = valuesByDimension.get(dimension);
    if (!tagValues) return false;
    return selectedValues.some((value) => tagValues.has(value));
  });
}
