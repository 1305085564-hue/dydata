export type TopicRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const TEAM_MEMBERSHIP_REQUIRED_CODE = "TEAM_MEMBERSHIP_REQUIRED" as const;

export class TopicRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "TopicRequestError";
  }
}

export function isTeamMembershipRequiredError(error: unknown): error is TopicRequestError {
  return error instanceof TopicRequestError
    && error.status === 403
    && error.code === TEAM_MEMBERSHIP_REQUIRED_CODE;
}

// V3 写作状态：多人可同时写同一题，服务端统一返回 writing
export type TopicClaimStatus = "writing";

export interface V2Claim {
  id: string;
  subTopicId: string;
  status: TopicClaimStatus;
  claimedAt: string | null;
}

export interface V2SubTopic {
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
  topics?: { id: string; name: string } | null;
  topic_groups?: { id: string; name: string } | null;
  myClaim: V2Claim | null;
}

export interface V2TopicPoolItem extends V2SubTopic {
  claimCount: number;
  candidateCount: number;
  scriptingCount: number;
  workCount: number;
  summary: V2WorkSummary | null;
  score?: number | null;
  daysSinceLastWork?: number | null;
}

export interface V2Suggestion extends V2SubTopic {
  score?: number;
}

export interface V2ComparisonRow {
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

export interface V2WorkItem {
  id: string;
  videoTitle: string;
  content: string | null;
  playCount: number | null;
  uploadedAt: string | null;
  userId: string | null;
  displayName: string | null;
}

export interface V2WorkSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
}

export interface V2WorksResponse {
  items: V2WorkItem[];
  similarReferences: V2WorkItem[];
  summary: V2WorkSummary | null;
  pagination: { page: number; pageSize: number; totalItems: number };
}

export interface V2DetailResponse {
  subTopic: V2SubTopic;
  works: V2WorksResponse;
}

export interface V2ClaimsResponse {
  candidateCount: number;
  scriptingCount: number;
  claims: Array<{
    id?: string;
    userId: string;
    displayName: string;
    status: TopicClaimStatus;
    claimedAt: string | null;
  }>;
}

export interface V2ActivityClaim {
  id: string;
  subTopicId: string;
  userId: string;
  displayName: string;
  status: TopicClaimStatus;
  claimedAt: string | null;
  subTopic: V2SubTopic | null;
}

export interface V2RecentlyWorked {
  id: string;
  videoTitle: string;
  uploadedAt: string | null;
  subTopic: V2SubTopic | null;
}

export interface V2ActiveTopicsResponse {
  recentlyClaimed: V2ActivityClaim[];
  recentlyWorked: V2RecentlyWorked[];
}

export interface V2ComparisonResponse {
  dimension: "topic" | "account";
  windowDays: number;
  rows: V2ComparisonRow[];
  sampleTotal: number;
}

export interface V2PoolResponse {
  items: V2TopicPoolItem[];
  pagination: { page: number; pageSize: number; totalItems: number };
}

export interface V2TopicOption {
  id: string;
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`选题接口返回的 ${field} 无效`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTopicReference(value: unknown): { id: string; name: string } | null {
  if (Array.isArray(value)) return parseTopicReference(value[0]);
  if (!isRecord(value)) return null;
  const id = nullableString(value.id);
  const name = nullableString(value.name);
  return id && name ? { id, name } : null;
}

function parseClaim(value: unknown, fallbackSubTopicId?: string): V2Claim | null {
  if (!isRecord(value)) return null;
  const id = nullableString(value.id);
  const subTopicId = nullableString(value.subTopicId) ?? nullableString(value.sub_topic_id) ?? fallbackSubTopicId;
  // V3 只有 writing 是有效在写状态；candidate/scripting 是迁移前的旧值，等价映射为 writing
  const rawStatus = value.status;
  const status = rawStatus === "writing" || rawStatus === "candidate" || rawStatus === "scripting"
    ? "writing"
    : null;
  if (!id || !subTopicId || !status) return null;
  return {
    id,
    subTopicId,
    status,
    claimedAt: nullableString(value.claimedAt) ?? nullableString(value.claimed_at),
  };
}

export function parseSubTopicResponse(value: unknown): V2SubTopic {
  if (!isRecord(value)) throw new Error("选题接口返回的子题结构无效");
  const id = requiredString(value.id, "id");
  return {
    id,
    title: requiredString(value.title, "title"),
    hook: nullableString(value.hook),
    topic_id: nullableString(value.topic_id),
    group_id: nullableString(value.group_id),
    emotion_tag: nullableString(value.emotion_tag),
    source: nullableString(value.source),
    audience: nullableString(value.audience),
    created_by: nullableString(value.created_by),
    created_at: nullableString(value.created_at),
    topics: parseTopicReference(value.topics),
    topic_groups: parseTopicReference(value.topic_groups),
    myClaim: parseClaim(value.myClaim, id),
  };
}

export async function fetchTopicJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  request: TopicRequest = fetch,
): Promise<T> {
  const response = await request(input, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `选题接口请求失败（${response.status}）`;
    const code = isRecord(payload) && typeof payload.code === "string" ? payload.code : undefined;
    throw new TopicRequestError(message, response.status, code);
  }
  return payload as T;
}

export function parseCreatedSubTopicResponse(value: unknown): V2SubTopic {
  return parseSubTopicResponse(value);
}

export function parseSuggestedSubTopicsResponse(value: unknown): V2Suggestion[] {
  if (!Array.isArray(value)) throw new Error("查重接口返回的 suggestions 结构无效");
  return value.map((item) => {
    const parsed = parseSubTopicResponse(item);
    const score = isRecord(item) ? nullableNumber(item.score) : null;
    return score === null ? parsed : { ...parsed, score };
  });
}

export function parseTopicOptionsResponse(value: unknown): V2TopicOption[] {
  if (!isRecord(value) || !Array.isArray(value.topics)) {
    throw new Error("母题 options 返回结构无效");
  }
  return value.topics.flatMap((topic) => {
    if (!isRecord(topic)) return [];
    const id = nullableString(topic.id);
    const name = nullableString(topic.name);
    return id && name ? [{ id, name }] : [];
  });
}

function parseSummary(value: unknown): V2WorkSummary | null {
  if (!isRecord(value)) return null;
  return {
    qualifiedWorkCount: numberOr(value.qualifiedWorkCount, 0),
    averagePlayCount: nullableNumber(value.averagePlayCount),
    bestPlayCount: nullableNumber(value.bestPlayCount),
    bestCopy: nullableString(value.bestCopy),
    latestCopy: nullableString(value.latestCopy),
  };
}

function parseSnapshotPlayCount(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const firstSnapshot = value.find((snapshot) => isRecord(snapshot) && "play_count" in snapshot);
  return isRecord(firstSnapshot) ? nullableNumber(firstSnapshot.play_count) : null;
}

function parseWork(value: unknown): V2WorkItem {
  if (!isRecord(value)) throw new Error("作品接口返回的作品结构无效");
  return {
    id: requiredString(value.id, "作品 id"),
    videoTitle: nullableString(value.video_title) ?? nullableString(value.title) ?? "未命名作品",
    content: nullableString(value.content),
    playCount: nullableNumber(value.playCount) ?? parseSnapshotPlayCount(value.video_metrics_snapshots),
    uploadedAt: nullableString(value.uploaded_at) ?? nullableString(value.uploadedAt),
    userId: nullableString(value.user_id) ?? nullableString(value.userId),
    displayName: nullableString(value.displayName) ?? nullableString(value.user_name),
  };
}

export function parseTopicWorksResponse(value: unknown): V2WorksResponse {
  if (!isRecord(value)) throw new Error("作品接口返回结构无效");
  const items = Array.isArray(value.items) ? value.items.map(parseWork) : [];
  const similarReferences = Array.isArray(value.similarReferences)
    ? value.similarReferences.map(parseWork)
    : [];
  const pagination = isRecord(value.pagination) ? value.pagination : {};
  return {
    items,
    similarReferences,
    summary: parseSummary(value.summary),
    pagination: {
      page: numberOr(pagination.page, 1),
      pageSize: numberOr(pagination.pageSize, 20),
      totalItems: numberOr(pagination.totalItems, items.length),
    },
  };
}

export function parseTopicPoolResponse(value: unknown): V2PoolResponse {
  if (!isRecord(value)) throw new Error("选题池接口返回结构无效");
  const items = Array.isArray(value.items)
    ? value.items.flatMap((item) => {
        if (!isRecord(item)) return [];
        const subTopic = parseSubTopicResponse(item);
        return [{
          ...subTopic,
          claimCount: numberOr(item.claimCount, 0),
          candidateCount: numberOr(item.candidateCount, 0),
          scriptingCount: numberOr(item.scriptingCount, 0),
          workCount: numberOr(item.workCount, 0),
          summary: parseSummary(item.summary),
          score: nullableNumber(item._score),
          daysSinceLastWork: nullableNumber(item._daysSinceLastWork),
        }];
      })
    : [];
  const pagination = isRecord(value.pagination) ? value.pagination : {};
  return {
    items,
    pagination: {
      page: numberOr(pagination.page, 1),
      pageSize: numberOr(pagination.pageSize, 50),
      totalItems: numberOr(pagination.totalItems, items.length),
    },
  };
}

function parseActivityClaim(value: unknown): V2ActivityClaim | null {
  if (!isRecord(value)) return null;
  const subTopicValue = Array.isArray(value.sub_topics) ? value.sub_topics[0] : value.sub_topics;
  const subTopic = isRecord(subTopicValue) && typeof subTopicValue.id === "string"
    ? parseSubTopicResponse(subTopicValue)
    : null;
  const userId = nullableString(value.userId) ?? nullableString(value.user_id);
  const subTopicId = nullableString(value.subTopicId) ?? nullableString(value.sub_topic_id) ?? subTopic?.id;
  // V3：只有 writing 是有效在写状态；candidate/scripting 是迁移前旧值，等价映射
  const status = value.status === "writing" || value.status === "candidate" || value.status === "scripting"
    ? "writing" as const
    : null;
  if (!userId || !subTopicId || !status) return null;
  const profile = Array.isArray(value.profiles) ? value.profiles[0] : value.profiles;
  const profileName = isRecord(profile) ? nullableString(profile.name) : null;
  return {
    id: nullableString(value.id) ?? `${userId}:${subTopicId}`,
    subTopicId,
    userId,
    displayName: nullableString(value.displayName) ?? nullableString(value.user_name) ?? profileName ?? "未命名成员",
    status,
    claimedAt: nullableString(value.claimedAt) ?? nullableString(value.claimed_at),
    subTopic,
  };
}

export function parseActiveTopicsResponse(value: unknown): V2ActiveTopicsResponse {
  if (!isRecord(value)) throw new Error("团队动态接口返回结构无效");
  const recentlyClaimed = Array.isArray(value.recentlyClaimed)
    ? value.recentlyClaimed.flatMap((item) => {
        const parsed = parseActivityClaim(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const recentlyWorked = Array.isArray(value.recentlyWorked)
    ? value.recentlyWorked.flatMap((item) => {
        if (!isRecord(item)) return [];
        const subTopicValue = Array.isArray(item.sub_topics) ? item.sub_topics[0] : item.sub_topics;
        let subTopic: V2SubTopic | null = null;
        try {
          subTopic = isRecord(subTopicValue) ? parseSubTopicResponse(subTopicValue) : null;
        } catch {
          subTopic = null;
        }
        const id = nullableString(item.id);
        if (!id) return [];
        return [{
          id,
          videoTitle: nullableString(item.video_title) ?? "未命名作品",
          uploadedAt: nullableString(item.uploaded_at),
          subTopic,
        }];
      })
    : [];
  return {
    recentlyClaimed,
    recentlyWorked,
  };
}

export function parseSubTopicDetailResponse(value: unknown): V2DetailResponse {
  if (!isRecord(value) || !isRecord(value.subTopic)) {
    throw new Error("详情接口返回结构无效");
  }
  return {
    subTopic: parseSubTopicResponse(value.subTopic),
    works: isRecord(value.works)
      ? parseTopicWorksResponse(value.works)
      : { items: [], similarReferences: [], summary: null, pagination: { page: 1, pageSize: 20, totalItems: 0 } },
  };
}

export function parseClaimsResponse(value: unknown): V2ClaimsResponse {
  if (!isRecord(value)) throw new Error("撞车接口返回结构无效");
  const claims = Array.isArray(value.claims)
    ? value.claims.flatMap((claim) => {
        if (!isRecord(claim)) return [];
        const id = nullableString(claim.id);
        const userId = nullableString(claim.userId);
        const rawStatus = claim.status;
        const status = rawStatus === "writing" || rawStatus === "candidate" || rawStatus === "scripting"
          ? "writing" as const
          : null;
        if (!userId || !status) return [];
        return [{
          ...(id ? { id } : {}),
          userId,
          displayName: nullableString(claim.displayName) ?? "未命名成员",
          status,
          claimedAt: nullableString(claim.claimedAt),
        }];
      })
    : [];
  // 旧键 candidateCount/scriptingCount 兼容；服务端已统一返回正在写人数
  const inProgress = numberOr(value.inProgressCount, 0);
  return {
    claims,
    candidateCount: numberOr(value.candidateCount, inProgress),
    scriptingCount: numberOr(value.scriptingCount, inProgress),
  };
}

export function parseComparisonResponse(value: unknown): V2ComparisonResponse {
  if (!isRecord(value) || (value.dimension !== "topic" && value.dimension !== "account")) {
    throw new Error("横向对比接口返回结构无效");
  }
  const rows = Array.isArray(value.rows)
    ? value.rows.flatMap((row) => {
        if (!isRecord(row)) return [];
        return [{
          topicId: nullableString(row.topicId) ?? undefined,
          topicName: nullableString(row.topicName) ?? undefined,
          accountId: nullableString(row.accountId),
          accountName: nullableString(row.accountName),
          workCount: numberOr(row.workCount, 0),
          qualifiedCount: numberOr(row.qualifiedCount, 0),
          qualifiedRate: numberOr(row.qualifiedRate, 0),
          avgPlayCount: numberOr(row.avgPlayCount, 0),
          bestPlayCount: numberOr(row.bestPlayCount, 0),
          lowConfidence: row.lowConfidence === true,
        }];
      })
    : [];
  return {
    dimension: value.dimension,
    windowDays: numberOr(value.windowDays, 30),
    rows,
    sampleTotal: numberOr(value.sampleTotal, 0),
  };
}

export function getTopicActionState(claim: V2Claim | null) {
  // V3：不再有「认领到候选」与候选位；同一个选题允许多人同时写
  if (claim?.status === "writing") {
    return { canClaim: false, canStartScripting: false, canReturn: true, label: "正在写" } as const;
  }
  return { canClaim: true, canStartScripting: false, canReturn: false, label: "我要写" } as const;
}
