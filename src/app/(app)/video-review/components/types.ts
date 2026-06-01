// 前端共用类型直接从后端 lib re-export，避免双倍维护
export type {
  DraftStatus,
  FeedbackHistoryItem,
  PublishDraft as PublishDraftRow,
  ReviewQueueItem,
  ApprovedDraftItem,
} from "@/lib/publish-drafts/types";

export interface VideoReviewAccount {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}
