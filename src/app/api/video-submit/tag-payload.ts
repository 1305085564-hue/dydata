type TagPayload = {
  video_id: string;
  tag_dimension: string;
  tag_value: string;
  source: "ai" | "manual";
  confidence: number | null;
  reason: string | null;
  reviewed_by: string | null;
};

const SINGLE_VALUE_DIMENSIONS = new Set(["题材", "表达形式", "CTA类型", "内容结构", "目标受众", "话题"]);

export function dedupeTagPayloads<T extends { tag_dimension: string; tag_value: string }>(tags: T[]) {
  const latestByDimension = new Map<string, T>();
  const seenMultiValueKeys = new Set<string>();
  const multiValueTags: T[] = [];

  for (const tag of tags) {
    if (SINGLE_VALUE_DIMENSIONS.has(tag.tag_dimension)) {
      latestByDimension.set(tag.tag_dimension, tag);
      continue;
    }

    const multiValueKey = `${tag.tag_dimension}::${tag.tag_value}`;
    if (seenMultiValueKeys.has(multiValueKey)) continue;
    seenMultiValueKeys.add(multiValueKey);
    multiValueTags.push(tag);
  }

  return [...latestByDimension.values(), ...multiValueTags];
}

export function buildManualTagPayload(input: {
  videoId: string;
  topicTag: string | null;
  videoForm?: string | null;
  contentKeywords: string[];
}) {
  const tags: TagPayload[] = [];

  if (input.topicTag) {
    tags.push({
      video_id: input.videoId,
      tag_dimension: "话题",
      tag_value: input.topicTag,
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    });
  }

  if (input.videoForm) {
    tags.push({
      video_id: input.videoId,
      tag_dimension: "表达形式",
      tag_value: input.videoForm,
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    });
  }

  if (input.contentKeywords.length) {
    tags.push(
      ...input.contentKeywords.map((keyword) => ({
        video_id: input.videoId,
        tag_dimension: "关键词",
        tag_value: keyword,
        source: "manual" as const,
        confidence: null,
        reason: null,
        reviewed_by: null,
      }))
    );
  }

  return dedupeTagPayloads(tags);
}
