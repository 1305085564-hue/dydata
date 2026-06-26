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
  const hasProblemTagsOverride = overrides.summary?.problem_tags !== undefined;
  const hasInstructionsOverride = overrides.actions?.instructions !== undefined;

  return {
    ...draft,
    summary: {
      ...draft.summary,
      ...overrides.summary,
      problem_tags: hasProblemTagsOverride ? (nextProblemTags ?? []).slice(0, 5) : draft.summary.problem_tags,
    },
    actions: {
      ...draft.actions,
      ...overrides.actions,
      instructions: hasInstructionsOverride ? (nextInstructions ?? []).slice(0, 5) : draft.actions.instructions,
    },
  };
}

type ManualPayloadInput = {
  summary: { one_line: string; problem_tags: string[] };
  actions: { instructions: string[]; message_for_member: string };
};

type SaveDraftMutationInput = {
  currentStatus: ContentFeedbackCardStatus;
  payload: NextDayReviewResult;
  managerNote: string | null;
  hasManagerNote: boolean;
  currentManagerNote: string | null;
  now: string;
};

export function buildManualConfirmedPayload(input: ManualPayloadInput): NextDayReviewResult {
  return {
    metrics: {
      play_count: null,
      bounce_rate_2s: null,
      completion_rate_5s: null,
      completion_rate: null,
      avg_play_duration: null,
      likes: null,
      comments: null,
      shares: null,
      follower_gain: null,
    },
    summary: {
      grade: "manual",
      one_line: input.summary.one_line,
      problem_tags: input.summary.problem_tags.slice(0, 5),
    },
    comparison: {
      account_baseline: { sample_count: 0, play_count: null, bounce_rate_2s: null, completion_rate_5s: null, completion_rate: null, avg_play_duration: null },
      peer_baseline: { available: false, sample_count: 0, summary: null },
    },
    segments: [],
    actions: {
      diagnosis: "",
      instructions: input.actions.instructions.slice(0, 5),
      message_for_member: input.actions.message_for_member,
    },
    anomaly_notice: null,
    cached: false,
  } as unknown as NextDayReviewResult;
}

export function buildFeedbackSaveDraftMutation(input: SaveDraftMutationInput): Record<string, unknown> {
  const managerNote = input.hasManagerNote ? input.managerNote : input.currentManagerNote;

  if (input.currentStatus === "confirmed") {
    return {
      card_status: "confirmed",
      manager_note: managerNote,
      confirmed_payload: input.payload,
    };
  }

  return {
    card_status: "draft",
    manager_note: managerNote,
    draft_payload: input.payload,
    draft_generated_at: input.now,
    confirmed_payload: null,
    confirmed_by: null,
    confirmed_at: null,
    sent_by: null,
    sent_at: null,
    viewed_at: null,
  };
}

export function isFeedbackCardDelivered(status: ContentFeedbackCardView["workflow_status"]) {
  return status === "sent" || status === "viewed";
}

export const CONTENT_FEEDBACK_CARD_SELECT =
  "id, video_id, target_user_id, target_account_id, source_result_id, card_status, manager_note, draft_payload, confirmed_payload, draft_generated_at, confirmed_by, confirmed_at, sent_by, sent_at, viewed_at, created_at, updated_at";
