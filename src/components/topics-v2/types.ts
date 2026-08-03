export type TopicPoolView = "all" | "my_claims" | "my_created" | "high_potential" | "never_worked";
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
  audience?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  topics?: TopicOption | null;
  topic_groups?: GroupOption | null;
  myClaim: TopicClaimItem | null;
}

export interface TopicWorkSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
}

export type TopicClaimStatus = "candidate" | "scripting" | "returned";

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
    status: "candidate" | "scripting";
    claimedAt: string | null;
  }>;
}

export interface TopicFocusItem extends SubTopicItem {
  reasonType: "recent_success" | "historical_high_avg_stale" | "legacy";
  reasonText: string;
  latestWorkedAt: string | null;
  daysSinceLastWork: number | null;
  summary: TopicWorkSummary;
}

export interface ActiveTopicsResponse {
  focusTopics: TopicFocusItem[];
  recentlyClaimed: TopicClaimItem[];
  recentlyWorked: Array<{
    id: string;
    videoTitle: string;
    uploadedAt: string | null;
    subTopic: SubTopicItem | null;
  }>;
  recentlyCreated: SubTopicItem[];
  worthRedoing: TopicFocusItem[];
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
