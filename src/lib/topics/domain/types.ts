import type { TopicExternalMetrics, TopicInternalMetrics } from "../metrics";

export const TOPIC_POOL_VIEWS = [
  "all",
  "my_claims",
  "my_created",
  "trending",
  "high_potential",
  "never_worked",
] as const;
export const TOPIC_TIME_RANGES = ["3d", "1w", "1m", "3m", "all"] as const;
export const TOPIC_CLAIM_STATUSES = ["writing", "cancelled", "completed"] as const;
export const TOPIC_WORK_SORTS = ["best", "recent"] as const;
export const TOPIC_POOL_SORTS = ["latest", "avg_play", "best_play", "recent_heat"] as const;

export type TopicPoolView = (typeof TOPIC_POOL_VIEWS)[number];
export type TopicTimeRange = (typeof TOPIC_TIME_RANGES)[number];
export type TopicClaimStatus = (typeof TOPIC_CLAIM_STATUSES)[number];
export type TopicWorkSort = (typeof TOPIC_WORK_SORTS)[number];
export type TopicPoolSort = (typeof TOPIC_POOL_SORTS)[number];

export interface TopicGroupOption {
  id: string;
  name: string;
}

export interface TopicOption {
  id: string;
  name: string;
}

export interface SuggestedSubTopicCandidate {
  id: string;
  title: string;
  hook: string | null;
  topicName: string | null;
  groupName: string | null;
}

export interface RankedSubTopicSuggestion extends SuggestedSubTopicCandidate {
  score: number;
}

export interface TopicWorkMetricInput {
  playCount: number | null;
  content: string | null;
  publishedAt?: string | null;
  uploadedAt: string | null;
}

export interface TopicWorkSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
  latestPublishedAt?: string | null;
  // V3：内部成绩（团队实拍）与外部成绩（导入参考）严格分开
  internalMetrics?: TopicInternalMetrics | null;
  externalMetrics?: TopicExternalMetrics | null;
}

export const TOPIC_SOURCE_TYPES = ["internal", "external"] as const;
export const TOPIC_DURATION_RANGES = ["under_2m", "2_5m", "over_5m"] as const;
export const TOPIC_RECENT_HEAT_FILTERS = [
  "has_participants",
  "has_completed",
  "has_in_progress",
  "no_participants",
] as const;
export const TOPIC_PERFORMANCE_TIERS = ["high_best_play", "high_qualified", "high_avg_play"] as const;

export type TopicSourceType = (typeof TOPIC_SOURCE_TYPES)[number];
export type TopicDurationRange = (typeof TOPIC_DURATION_RANGES)[number];
export type TopicRecentHeatFilter = (typeof TOPIC_RECENT_HEAT_FILTERS)[number];
export type TopicPerformanceTier = (typeof TOPIC_PERFORMANCE_TIERS)[number];

export interface TopicPoolQueryOptions {
  view: TopicPoolView;
  timeRange: TopicTimeRange;
  topicIds: string[];
  page: number;
  pageSize: number;
  q?: string | null;
  sort?: TopicPoolSort;
  sourceType?: TopicSourceType;
  recentHeat?: TopicRecentHeatFilter;
  durationRange?: TopicDurationRange;
  performance?: TopicPerformanceTier;
}

export type ApiFailure = {
  ok: false;
  status: number;
  message: string;
  work_count?: number;
};

export type ApiSuccess<T> = {
  ok: true;
  value: T;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type TopicMutationActor = {
  actorId: string;
  teamId: string;
  canReviewContent: boolean;
};

export interface CurrentUserClaim {
  id: string;
  subTopicId: string;
  status: Extract<TopicClaimStatus, "writing">;
  claimedAt: string | null;
}

export interface Recent7dHeat {
  completedCount: number;
  inProgressCount: number;
  participants: number;
  currentWritingCount?: number;
}

export type TopicPoolWorkAggregate = {
  workCount: number;
  internalBestPlay: number | null;
  internalAvgPlay: number | null;
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
  latestPublishedAt: string | null;
  completedCount: number;
  inProgressCount: number;
  participants: number;
  currentWritingCount?: number;
};

type SortableTopicPoolItem = {
  id: string;
  created_at?: string | null;
  title?: string | null;
  hook?: string | null;
  claimCount?: number;
  summary?: { averagePlayCount?: number | null; bestPlayCount?: number | null } | null;
  recent7dParticipants?: number;
};

export type { SortableTopicPoolItem };
