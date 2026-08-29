export type TopicPoolView = "all" | "my_claims" | "my_created";
export type TopicTimeRange = "3d" | "1w" | "1m" | "3m" | "all";
export type TopicComparisonDimension = "topic" | "account";

export interface TopicOption {
  id: string;
  name: string;
}

export interface GroupOption {
  id: string;
  name: string;
}

export interface SubTopicItem {
  id: string;
  title: string;
  hook: string | null;
  topic_id?: string | null;
  group_id?: string | null;
  emotion_tag?: string | null;
  source?: string | null;
  source_type?: "internal" | "external" | null;
  duration_range?: "under_2m" | "2_5m" | "over_5m" | null;
  audience?: string | null;
  outline?: string[] | string | null;
  created_by?: string | null;
  created_at?: string | null;
  topics?: TopicOption | null;
  topic_groups?: GroupOption | null;
  myClaim: TopicClaimItem | null;
  isWritingByMe?: boolean;
  summary?: TopicWorkSummary | null;
}

export interface TopicWorkSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
  // V3 细分内部与外部历史指标
  internalMetrics?: {
    bestPlayCount: number | null;
    averagePlayCount: number | null;
    qualifiedWorkCount: number;
    workCount: number;
  } | null;
  externalMetrics?: {
    bestPlayCount: number | null;
    averagePlayCount: number | null;
    likesCount: number | null;
    sampleCount?: number;
  } | null;
}

// V3 写作状态：多人可同时写同一题；提交关联作品后自动结束
export type TopicClaimStatus = "writing" | "cancelled" | "completed";

export interface TopicClaimItem {
  id: string;
  subTopicId: string;
  userId?: string;
  status: TopicClaimStatus;
  claimedAt: string | null;
  returnedAt?: string | null;
  displayName?: string;
  subTopic?: SubTopicItem | null;
}

export interface TopicPoolItem extends SubTopicItem {
  myClaim: TopicClaimItem | null;
  claimCount: number;
  candidateCount: number;
  scriptingCount: number;
  workCount: number;
  summary: TopicWorkSummary | null;
  score?: number | null;
  daysSinceLastWork?: number | null;
  // V3 7 天真实参与热度
  recent7dParticipants?: number;
  recent7dCompletedCount?: number;
  recent7dInProgressCount?: number;
  isWritingByMe?: boolean;
}

export interface TopicWorkItem {
  id: string;
  videoTitle: string;
  content: string | null;
  playCount: number | null;
  uploadedAt: string | null;
  userId: string | null;
  displayName: string | null;
}

export interface TopicWorksResponse {
  items: TopicWorkItem[];
  similarReferences: TopicWorkItem[];
  summary: TopicWorkSummary | null;
  pagination: { page: number; pageSize: number; totalItems: number };
}

export interface TopicClaimsDetailResponse {
  candidateCount: number;
  scriptingCount: number;
  claims: Array<{
    id: string;
    userId: string;
    displayName: string;
    status: "writing";
    claimedAt: string | null;
  }>;
  // V3 7 天参与去重统计
  recent7dSummary?: {
    totalParticipants: number;
    completedCount: number;
    inProgressCount: number;
  };
}

export interface ActiveTopicsResponse {
  recentlyClaimed: TopicClaimItem[];
  recentlyWorked: Array<{
    id: string;
    videoTitle: string;
    uploadedAt: string | null;
    subTopic: SubTopicItem | null;
  }>;
}

export interface TopicComparisonItem {
  topicId?: string;
  topicName?: string;
  accountId?: string | null;
  accountName?: string | null;
  workCount: number;
  qualifiedCount: number;
  qualifiedRate: number;
  avgPlayCount: number;
  bestPlayCount: number;
  lowConfidence: boolean;
}

// V3 高级筛选状态
export interface TopicMoreFiltersState {
  sourceType: "all" | "internal" | "external";
  recentHeat: "all" | "has_participants" | "has_completed" | "has_in_progress" | "no_participants";
  durationRange: "all" | "under_2m" | "2_5m" | "over_5m";
  performanceTier: "all" | "high_best_play" | "high_qualified" | "high_avg_play";
}

export const DEFAULT_MORE_FILTERS: TopicMoreFiltersState = {
  sourceType: "all",
  recentHeat: "all",
  durationRange: "all",
  performanceTier: "all",
};

// V3 外部干货批量导入预览与校验契约
export interface BatchImportParsedRow {
  rowNumber: number;
  topicName: string;
  title: string;
  durationText?: string;
  historyPlay: number | null;
  historyLikes: number | null;
  hook?: string | null;
  outline?: string | null;
  status: "valid" | "warning" | "error";
  validationMessage: string;
}

export interface BatchImportSummary {
  totalCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  errors: Array<{
    rowNumber: number;
    title: string;
    reason: string;
  }>;
}

