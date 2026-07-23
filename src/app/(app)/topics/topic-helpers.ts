export type TopicPoolRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchTopicPoolResponse(
  url: string,
  request: TopicPoolRequest = fetch,
) {
  const response = await request(url);
  const payload = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "获取选题池数据失败")
      : "获取选题池数据失败";
    throw new Error(message);
  }
  return payload;
}

export const DETAIL_PAGE_SIZE = 20;

export interface SubTopicDetail {
  id: string;
  title: string;
  hook: string | null;
  emotion_tag: string | null;
  audience: string | null;
  created_by: string;
  created_at: string;
  topics: {
    id: string;
    name: string;
  } | null;
  topic_groups: {
    id: string;
    name: string;
  } | null;
}

export interface WorkItem {
  id: string;
  video_title: string;
  video_url: string;
  uploadedAt?: string | null;
  uploaded_at?: string | null;
  account_name?: string;
  video_metrics_snapshots?: Array<{
    play_count?: number;
    likes?: number;
    like_count?: number;
  }>;
}

export interface ReferenceWork {
  id: string;
  video_title?: string;
  title?: string;
  account_name?: string;
  play_count?: number;
  like_count?: number;
  video_metrics_snapshots?: Array<{
    play_count?: number;
  }>;
}

export function resolvePageAfterLoad(currentPage: number, succeeded: boolean) {
  return succeeded ? currentPage + 1 : currentPage;
}

export interface RecommendationReferenceVideo {
  title?: string;
  playCount24h?: number;
  playCount?: number;
}

export interface RecommendationSuggestion {
  title: string;
  category: string;
  angle?: string | null;
  expectedPerformance?: string | null;
  evidence?: string | null;
  referenceVideos?: RecommendationReferenceVideo[];
}

export interface RecommendationResponse {
  evidenceSummary?: string | null;
  sampleCount?: number;
  marketDate?: string | null;
  suggestions?: RecommendationSuggestion[];
}

export interface ComparisonRow {
  topicId?: string;
  topicName?: string;
  accountId?: string;
  accountName?: string;
  workCount: number;
  qualifiedRate: number;
  avgPlayCount: number;
  bestPlayCount: number;
  lowConfidence?: boolean;
}

export function getRecommendationKey(
  rec: { title: string; category?: string | null; angle?: string | null }
): string {
  return `${rec.title}-${rec.category || ""}-${rec.angle || ""}`;
}

export function resolveWorkLikes(
  snap?: { likes?: number; like_count?: number } | null
): number {
  if (!snap) return 0;
  return snap.likes ?? snap.like_count ?? 0;
}

export function calculateTotalInFlight(claims: {
  candidateCount?: number;
  scriptingCount?: number;
}): number {
  return (claims.candidateCount ?? 0) + (claims.scriptingCount ?? 0);
}

export function parseSubTopicDetailResponse(data: unknown) {
  if (!data || typeof data !== "object") return { subTopic: null, worksItems: [] as WorkItem[], worksTotal: 0 };
  const root = (data as Record<string, unknown>).value || data;
  const obj = root as Record<string, unknown>;
  const subTopic = (obj.subTopic || obj) as SubTopicDetail;
  const worksPayload = parseSubTopicWorksResponse(obj.works || obj);
  return {
    subTopic,
    worksItems: worksPayload.items,
    worksTotal: worksPayload.total
  };
}

export function parseSubTopicWorksResponse(data: unknown) {
  if (!data || typeof data !== "object") {
    return { items: [] as WorkItem[], similarReferences: [] as ReferenceWork[], total: 0, page: 1, pageSize: DETAIL_PAGE_SIZE };
  }
  const root = ((data as Record<string, unknown>).value || data) as Record<string, unknown>;
  const items = Array.isArray(root.items) ? (root.items as WorkItem[]) : [];
  const similarReferences = Array.isArray(root.similarReferences) ? (root.similarReferences as ReferenceWork[]) : [];
  const paginationObj = root.pagination as Record<string, unknown> | undefined;
  const total = typeof paginationObj?.totalItems === "number"
    ? paginationObj.totalItems
    : typeof root.total === "number"
    ? root.total
    : items.length;
  const page = typeof paginationObj?.page === "number" ? paginationObj.page : 1;
  const pageSize = typeof paginationObj?.pageSize === "number" ? paginationObj.pageSize : DETAIL_PAGE_SIZE;
  return { items, similarReferences, total, page, pageSize };
}

