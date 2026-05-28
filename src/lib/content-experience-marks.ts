import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTENT_EXPERIENCE_TYPES = [
  "hot_case",
  "fail_case",
  "opening_issue",
  "middle_issue",
  "retention_issue",
  "conversion_issue",
] as const;

export const CONTENT_EXPERIENCE_VISIBILITY_SCOPES = ["team", "company"] as const;

export type ContentExperienceType = (typeof CONTENT_EXPERIENCE_TYPES)[number];
export type ContentExperienceVisibilityScope = (typeof CONTENT_EXPERIENCE_VISIBILITY_SCOPES)[number];

export type ContentExperienceMark = {
  id: string;
  video_id: string;
  feedback_card_id: string | null;
  ai_insight_result_id: string | null;
  experience_type: ContentExperienceType;
  note: string | null;
  marked_by: string;
  visibility_scope: ContentExperienceVisibilityScope;
  created_at: string;
  updated_at: string;
};

export type UpsertContentExperienceMarkInput = {
  videoId: string;
  markedBy: string;
  experienceType: ContentExperienceType;
  visibilityScope: ContentExperienceVisibilityScope;
  note?: string | null;
  feedbackCardId?: string | null;
  aiInsightResultId?: string | null;
};

export const CONTENT_EXPERIENCE_MARK_SELECT =
  "id, video_id, feedback_card_id, ai_insight_result_id, experience_type, note, marked_by, visibility_scope, created_at, updated_at";

export function isContentExperienceType(value: unknown): value is ContentExperienceType {
  return typeof value === "string" && CONTENT_EXPERIENCE_TYPES.includes(value as ContentExperienceType);
}

export function isContentExperienceVisibilityScope(value: unknown): value is ContentExperienceVisibilityScope {
  return typeof value === "string" && CONTENT_EXPERIENCE_VISIBILITY_SCOPES.includes(value as ContentExperienceVisibilityScope);
}

export function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeOptionalUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildContentExperienceMarkUpsertPayload(input: UpsertContentExperienceMarkInput) {
  return {
    video_id: input.videoId,
    marked_by: input.markedBy,
    feedback_card_id: input.feedbackCardId ?? null,
    ai_insight_result_id: input.aiInsightResultId ?? null,
    experience_type: input.experienceType,
    note: normalizeNullableText(input.note),
    visibility_scope: input.visibilityScope,
    updated_at: new Date().toISOString(),
  };
}

export async function listContentExperienceMarks(
  supabase: Pick<SupabaseClient, "from">,
  videoId: string,
) {
  const { data, error } = await supabase
    .from("content_experience_marks")
    .select(CONTENT_EXPERIENCE_MARK_SELECT)
    .eq("video_id", videoId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "加载经验标记失败");
  }

  return (data ?? []) as ContentExperienceMark[];
}

export async function upsertContentExperienceMark(
  supabase: Pick<SupabaseClient, "from">,
  input: UpsertContentExperienceMarkInput,
) {
  const payload = buildContentExperienceMarkUpsertPayload(input);
  const { data, error } = await supabase
    .from("content_experience_marks")
    .upsert(payload, { onConflict: "video_id,marked_by" })
    .select(CONTENT_EXPERIENCE_MARK_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "保存经验标记失败");
  }

  return data as ContentExperienceMark;
}
