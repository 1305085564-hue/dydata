import type {
  ContentFeedbackCardDetail,
  ContentFeedbackCardStatus,
  ContentFeedbackCardView,
  NextDayReviewResult,
} from "@/types";

type FeedbackCardLike = {
  id: string;
  video_id: string;
  card_status: ContentFeedbackCardStatus;
  manager_note: string | null;
  draft_payload: NextDayReviewResult | null;
  confirmed_payload: NextDayReviewResult | null;
  draft_generated_at: string | null;
  confirmed_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
};

type ConfirmOverrides = {
  summary?: Partial<Pick<NextDayReviewResult["summary"], "grade" | "one_line" | "problem_tags">>;
  actions?: Partial<Pick<NextDayReviewResult["actions"], "diagnosis" | "instructions" | "message_for_member">>;
};

function getWorkflowLabel(status: ContentFeedbackCardView["workflow_status"]) {
  switch (status) {
    case "draft":
      return "AI初稿待确认";
    case "confirmed":
      return "已确认待下发";
    case "sent":
      return "已下发待查看";
    case "viewed":
      return "员工已查看";
    default:
      return "未生成";
  }
}

export function buildContentFeedbackCardView(
  videoId: string,
  card: FeedbackCardLike | null,
): ContentFeedbackCardView {
  const workflowStatus = card?.card_status ?? "not_started";

  return {
    card_id: card?.id ?? null,
    video_id: videoId,
    workflow_status: workflowStatus,
    workflow_label: getWorkflowLabel(workflowStatus),
    has_ai_draft: Boolean(card?.draft_payload),
    latest_draft_at: card?.draft_generated_at ?? null,
    confirmed_at: card?.confirmed_at ?? null,
    sent_at: card?.sent_at ?? null,
    viewed_at: card?.viewed_at ?? null,
    manager_note: card?.manager_note ?? null,
  };
}

export function buildContentFeedbackCardDetail(
  videoId: string,
  card: FeedbackCardLike | null,
): ContentFeedbackCardDetail {
  const view = buildContentFeedbackCardView(videoId, card);

  return {
    ...view,
    draft: card?.draft_payload ?? null,
    confirmed: card?.confirmed_payload ?? null,
  };
}

export function buildConfirmedFeedbackPayload(
  draft: NextDayReviewResult,
  overrides: ConfirmOverrides = {},
): NextDayReviewResult {
  const nextProblemTags = overrides.summary?.problem_tags?.map((item) => item.trim()).filter(Boolean);
  const nextInstructions = overrides.actions?.instructions?.map((item) => item.trim()).filter(Boolean);

  return {
    ...draft,
    summary: {
      ...draft.summary,
      ...overrides.summary,
      problem_tags: nextProblemTags?.length ? nextProblemTags.slice(0, 5) : draft.summary.problem_tags,
    },
    actions: {
      ...draft.actions,
      ...overrides.actions,
      instructions: nextInstructions?.length ? nextInstructions.slice(0, 5) : draft.actions.instructions,
    },
  };
}

export function isFeedbackCardDelivered(status: ContentFeedbackCardView["workflow_status"]) {
  return status === "sent" || status === "viewed";
}

export const CONTENT_FEEDBACK_CARD_SELECT =
  "id, video_id, target_user_id, target_account_id, source_result_id, card_status, manager_note, draft_payload, confirmed_payload, draft_generated_at, confirmed_by, confirmed_at, sent_by, sent_at, viewed_at, created_at, updated_at";
