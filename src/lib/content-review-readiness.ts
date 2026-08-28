import type {
  ContentReviewReadiness,
  ContentReviewReadinessStatus,
  Video,
} from "@/types";

function getReadinessLabel(status: ContentReviewReadinessStatus) {
  switch (status) {
    case "missing_snapshot":
      return "缺24h数据";
    case "missing_content":
      return "缺文案";
    case "missing_segments":
      return "缺拆段";
    case "ready":
      return "可分析";
    case "analyzed":
      return "已有分析";
    default:
      return "未生成";
  }
}

export function buildContentReviewReadiness(input: {
  video: Pick<Video, "id" | "content">;
  hasSnapshot24h: boolean;
  hasSegments: boolean;
  hasAnalysis: boolean;
}): ContentReviewReadiness {
  const hasContent = Boolean(input.video.content?.trim());
  const status: ContentReviewReadinessStatus = !input.hasSnapshot24h
    ? "missing_snapshot"
    : !hasContent
      ? "missing_content"
      : !input.hasSegments
        ? "missing_segments"
        : input.hasAnalysis
          ? "analyzed"
          : "ready";

  return {
    video_id: input.video.id,
    status,
    label: getReadinessLabel(status),
    can_generate: input.hasSnapshot24h && hasContent,
    has_snapshot_24h: input.hasSnapshot24h,
    has_content: hasContent,
    has_segments: input.hasSegments,
    has_analysis: input.hasAnalysis,
  };
}
