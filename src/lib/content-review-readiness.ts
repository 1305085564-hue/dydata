import type {
  ContentFeedbackCardView,
  ContentReviewReadiness,
  ContentReviewReadinessStatus,
  Video,
} from "@/types";

function getReadinessLabel(status: ContentReviewReadinessStatus) {
  switch (status) {
    case "draft":
      return "AI初稿待确认";
    case "confirmed":
      return "已确认待下发";
    case "sent":
      return "已下发待查看";
    case "viewed":
      return "员工已查看";
    case "missing_snapshot":
      return "缺24h数据";
    case "missing_content":
      return "缺文案";
    case "missing_segments":
      return "缺拆段";
    case "ready":
      return "可生成";
    default:
      return "未生成";
  }
}

export function buildContentReviewReadiness(input: {
  video: Pick<Video, "id" | "content">;
  feedbackCard: ContentFeedbackCardView;
  hasSnapshot24h: boolean;
  hasSegments: boolean;
}): ContentReviewReadiness {
  const hasContent = Boolean(input.video.content?.trim());
  let status: ContentReviewReadinessStatus = input.feedbackCard.workflow_status;

  if (status === "not_started") {
    if (!input.hasSnapshot24h) {
      status = "missing_snapshot";
    } else if (!hasContent) {
      status = "missing_content";
    } else if (!input.hasSegments) {
      status = "missing_segments";
    } else {
      status = "ready";
    }
  }

  return {
    video_id: input.video.id,
    status,
    label: getReadinessLabel(status),
    can_generate:
      input.feedbackCard.workflow_status === "not_started" &&
      input.hasSnapshot24h &&
      hasContent,
    has_snapshot_24h: input.hasSnapshot24h,
    has_content: hasContent,
    has_segments: input.hasSegments,
  };
}
