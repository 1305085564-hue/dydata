export interface SubTopicClaim {
  id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
}

export interface TopicBase {
  id: string;
  title: string;
  hook: string;
  topics: {
    id: string;
    name: string;
  } | null;
  topic_groups: {
    id: string;
    name: string;
  } | null;
}

export interface SubTopicItem extends TopicBase {
  created_by: string;
  created_at: string;
  sub_topic_claims?: SubTopicClaim[];
}

export interface WorthRedoingSummary {
  qualifiedWorkCount?: number;
  averagePlayCount?: number | null;
  bestCopy?: string | null;
}

export interface WorthRedoingItem {
  id: string;
  title: string;
  hook: string;
  summary?: WorthRedoingSummary;
  topics?: {
    id: string;
    name: string;
  } | null;
  topic_groups?: {
    id: string;
    name: string;
  } | null;
  sub_topic_claims?: SubTopicClaim[];
}

export interface ClaimRecord {
  id: string;
  sub_topic_id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
  sub_topics: SubTopicItem | null;
}

export interface WorkRecord {
  id: string;
  topic_id: string | null;
  user_id: string;
  video_title: string;
  content: string | null;
  uploadedAt: string | null;
  sub_topics: TopicBase | null;
}

export interface ActiveData {
  overallAveragePlayCount?: number | null;
  worthRedoing?: WorthRedoingItem[];
  recentlyClaimed: ClaimRecord[];
  recentlyWorked: WorkRecord[];
  recentlyCreated: SubTopicItem[];
}

export type ActiveTopicsRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchActiveTopicsResponse(
  request: ActiveTopicsRequest = fetch,
): Promise<ActiveData> {
  const response = await request("/api/topics/active?limit=8");
  const payload = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "获取活跃选题失败")
      : "获取活跃选题失败";
    throw new Error(message);
  }
  return payload as ActiveData;
}

export async function fetchTodayClaimsResponse(
  request: ActiveTopicsRequest = fetch,
): Promise<SubTopicItem[]> {
  const response = await request("/api/topics/pool?view=my_claims");
  const payload = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "认领状态加载失败")
      : "认领状态加载失败";
    throw new Error(message);
  }
  return Array.isArray(payload?.items) ? payload.items : [];
}
