import type { DataAccessScope } from "@/lib/data-access-scope";
import {
  TOPIC_AUDIENCE_MAX_LENGTH,
  TOPIC_CATEGORY_MAX_LENGTH,
  TOPIC_EMOTION_TAG_MAX_LENGTH,
  TOPIC_HOOK_MAX_LENGTH,
  TOPIC_ID_MAX_LENGTH,
  TOPIC_SOURCE_MAX_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
  validateTextBoundary,
} from "@/lib/input-boundaries";
import type { TopicClaimStatus, ApiFailure, CurrentUserClaim } from "./types";
import { isUuidLike } from "./query-options";

function applyScope<T extends { user_id?: string | null }>(rows: T[], scope: DataAccessScope) {
  if (scope.kind === "all") return rows;
  return rows.filter((row) => row.user_id && scope.visibleUserIds.includes(row.user_id));
}

export function filterTopicClaimsByScope<T extends { user_id?: string | null }>(rows: T[], scope: DataAccessScope) {
  return applyScope(rows, scope);
}

export function buildClaimActivity(
  rows: Array<Record<string, unknown> & { user_id?: string | null; status?: string | null; claimed_at?: string | null }>,
  scope: DataAccessScope,
) {
  const writingRows = rows.filter((row) => row.status === "writing");
  const inProgressCount = writingRows.length;
  const claims = applyScope(writingRows, scope)
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const displayName = typeof (profile as { name?: unknown } | null)?.name === "string"
        ? (profile as { name: string }).name
        : "未命名成员";
      return {
        userId: String(row.user_id),
        displayName,
        status: "writing" as Extract<TopicClaimStatus, "writing">,
        claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
      };
    })
    .sort((a, b) => (Date.parse(b.claimedAt ?? "") || 0) - (Date.parse(a.claimedAt ?? "") || 0));
  return { claims, inProgressCount, candidateCount: inProgressCount, scriptingCount: inProgressCount };
}

function validateTopicText(value: unknown, label: string, maxLength: number, requiredMessage?: string): { ok: true; data: string | null } | ApiFailure {
  const result = validateTextBoundary({ label, value, maxLength, required: Boolean(requiredMessage) });
  if (!result.ok) {
    const message = requiredMessage && result.error === `${label}不能为空` ? requiredMessage : result.error;
    return { ok: false as const, status: 400, message };
  }
  return { ok: true as const, data: result.data };
}

export function validateRecommendationSubTopicInput(body: unknown) {
  if (!body || typeof body !== "object") return { ok: false as const, status: 400, message: "请求体格式不正确" };
  const payload = body as Record<string, unknown>;
  const title = validateTopicText(payload.title, "title", TOPIC_TITLE_MAX_LENGTH, "title 为必填项");
  if (!title.ok) return title;
  const hook = validateTopicText(payload.angle, "angle", TOPIC_HOOK_MAX_LENGTH, "angle 为必填项");
  if (!hook.ok) return hook;
  const category = validateTopicText(payload.category, "category", TOPIC_CATEGORY_MAX_LENGTH);
  if (!category.ok) return category;
  const emotionTag = validateTopicText(payload.emotion_tag, "emotion_tag", TOPIC_EMOTION_TAG_MAX_LENGTH);
  if (!emotionTag.ok) return emotionTag;
  const audience = validateTopicText(payload.audience, "audience", TOPIC_AUDIENCE_MAX_LENGTH);
  if (!audience.ok) return audience;
  return { ok: true as const, value: { title: title.data, hook: hook.data, category: category.data, emotionTag: emotionTag.data, audience: audience.data } };
}

export function validateSubTopicInput(body: unknown, mode: "create" | "update") {
  if (!body || typeof body !== "object") return { ok: false as const, status: 400, message: "请求体格式不正确" };
  const payload = body as Record<string, unknown>;
  const title = validateTopicText(payload.title, "title", TOPIC_TITLE_MAX_LENGTH);
  if (!title.ok) return title;
  const hook = validateTopicText(payload.hook, "hook", TOPIC_HOOK_MAX_LENGTH);
  if (!hook.ok) return hook;
  const topicId = validateTopicText(payload.topic_id, "topic_id", TOPIC_ID_MAX_LENGTH);
  if (!topicId.ok) return topicId;
  if (topicId.data && !isUuidLike(topicId.data)) return { ok: false as const, status: 400, message: "topic_id 格式不正确" };
  const emotionTag = validateTopicText(payload.emotion_tag, "emotion_tag", TOPIC_EMOTION_TAG_MAX_LENGTH);
  if (!emotionTag.ok) return emotionTag;
  const source = validateTopicText(payload.source, "source", TOPIC_SOURCE_MAX_LENGTH);
  if (!source.ok) return source;
  const audience = validateTopicText(payload.audience, "audience", TOPIC_AUDIENCE_MAX_LENGTH);
  if (!audience.ok) return audience;
  if (mode === "create") {
    if (!title.data) return { ok: false as const, status: 400, message: "title 为必填项" };
    if (!topicId.data) return { ok: false as const, status: 400, message: "topic_id 为必填项" };
  }
  return { ok: true as const, value: { title: title.data, hook: hook.data, topicId: topicId.data, emotionTag: emotionTag.data, source: source.data, audience: audience.data } };
}

export function buildMyClaim(
  rows: Array<{ id?: unknown; sub_topic_id?: unknown; user_id?: unknown; status?: unknown; claimed_at?: unknown }>,
  userId: string,
  subTopicId: string,
): CurrentUserClaim | null {
  const match = rows
    .filter((row) => row.user_id === userId && row.sub_topic_id === subTopicId && row.status === "writing" && typeof row.id === "string")
    .sort((left, right) => (Date.parse(String(right.claimed_at ?? "")) || 0) - (Date.parse(String(left.claimed_at ?? "")) || 0))[0];
  if (!match || typeof match.id !== "string") return null;
  return { id: match.id, subTopicId, status: "writing", claimedAt: typeof match.claimed_at === "string" ? match.claimed_at : null };
}
