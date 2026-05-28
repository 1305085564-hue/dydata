import type { SupabaseClient } from "@supabase/supabase-js";

export const TRAFFIC_PEAK_LEVELS = ["high", "medium", "low", "unset"] as const;
export const POST_PEAK_TRENDS = ["smooth_decline", "cliff_drop", "multiple_peaks", "unset"] as const;
export const TRAFFIC_RETENTION_QUALITIES = ["good", "average", "poor", "unset"] as const;
export const DROP_OFF_STAGES = ["opening", "middle", "ending", "not_obvious", "unset"] as const;
export const SUSPECTED_PROBLEM_STAGES = [
  "opening",
  "middle_content",
  "topic_mismatch",
  "weak_interaction",
  "weak_conversion",
  "unset",
] as const;

export type TrafficPeakLevel = (typeof TRAFFIC_PEAK_LEVELS)[number];
export type PostPeakTrend = (typeof POST_PEAK_TRENDS)[number];
export type TrafficRetentionQuality = (typeof TRAFFIC_RETENTION_QUALITIES)[number];
export type DropOffStage = (typeof DROP_OFF_STAGES)[number];
export type SuspectedProblemStage = (typeof SUSPECTED_PROBLEM_STAGES)[number];

export type ContentObservation = {
  id: string;
  video_id: string;
  observer_id: string;
  traffic_peak_level: TrafficPeakLevel | null;
  post_peak_trend: PostPeakTrend | null;
  traffic_retention_quality: TrafficRetentionQuality | null;
  drop_off_stage: DropOffStage | null;
  suspected_problem_stage: SuspectedProblemStage | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentObservationInput = {
  traffic_peak_level?: unknown;
  post_peak_trend?: unknown;
  traffic_retention_quality?: unknown;
  drop_off_stage?: unknown;
  suspected_problem_stage?: unknown;
  note?: unknown;
};

export const CONTENT_OBSERVATION_SELECT =
  "id, video_id, observer_id, traffic_peak_level, post_peak_trend, traffic_retention_quality, drop_off_stage, suspected_problem_stage, note, created_at, updated_at";

type ObservationUpsertRow = {
  video_id: string;
  observer_id: string;
  traffic_peak_level: TrafficPeakLevel | null;
  post_peak_trend: PostPeakTrend | null;
  traffic_retention_quality: TrafficRetentionQuality | null;
  drop_off_stage: DropOffStage | null;
  suspected_problem_stage: SuspectedProblemStage | null;
  note: string | null;
  updated_at: string;
};

function isUnset(value: unknown) {
  return value === undefined || value === null || value === "" || value === "unset";
}

function normalizeEnum<T extends readonly string[]>(field: string, value: unknown, allowed: T): T[number] | null {
  if (isUnset(value)) return null;
  if (typeof value === "string" && allowed.includes(value)) return value as T[number];
  throw new Error(`${field} 枚举值不正确`);
}

function normalizeNote(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("note 只能是字符串或 null");
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildContentObservationUpsertRow({
  videoId,
  observerId,
  input,
  now = new Date().toISOString(),
}: {
  videoId: string;
  observerId: string;
  input: ContentObservationInput;
  now?: string;
}): ObservationUpsertRow {
  return {
    video_id: videoId,
    observer_id: observerId,
    traffic_peak_level: normalizeEnum("traffic_peak_level", input.traffic_peak_level, TRAFFIC_PEAK_LEVELS),
    post_peak_trend: normalizeEnum("post_peak_trend", input.post_peak_trend, POST_PEAK_TRENDS),
    traffic_retention_quality: normalizeEnum(
      "traffic_retention_quality",
      input.traffic_retention_quality,
      TRAFFIC_RETENTION_QUALITIES,
    ),
    drop_off_stage: normalizeEnum("drop_off_stage", input.drop_off_stage, DROP_OFF_STAGES),
    suspected_problem_stage: normalizeEnum(
      "suspected_problem_stage",
      input.suspected_problem_stage,
      SUSPECTED_PROBLEM_STAGES,
    ),
    note: normalizeNote(input.note),
    updated_at: now,
  };
}

export async function loadContentObservation({
  supabase,
  videoId,
  observerId,
}: {
  supabase: Pick<SupabaseClient, "from">;
  videoId: string;
  observerId: string;
}) {
  const { data, error } = await supabase
    .from("content_observations")
    .select(CONTENT_OBSERVATION_SELECT)
    .eq("video_id", videoId)
    .eq("observer_id", observerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "加载观察记录失败");
  }

  return (data as ContentObservation | null) ?? null;
}

export async function saveContentObservation({
  supabase,
  videoId,
  observerId,
  input,
}: {
  supabase: Pick<SupabaseClient, "from">;
  videoId: string;
  observerId: string;
  input: ContentObservationInput;
}) {
  const row = buildContentObservationUpsertRow({ videoId, observerId, input });
  const { data, error } = await supabase
    .from("content_observations")
    .upsert(row, { onConflict: "video_id,observer_id" })
    .select(CONTENT_OBSERVATION_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "保存观察记录失败");
  }

  return data as ContentObservation;
}
