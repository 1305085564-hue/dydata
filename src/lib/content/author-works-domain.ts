import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { ContentListQuery } from "./domain/content-list-query";
import { DEFAULT_CONTENT_LIST_FILTERS } from "@/app/(app)/admin/content/content-list-filters";
import { DEFAULT_EVALUATION_STANDARDS, evaluationTone } from "@/lib/evaluation-standards";

export interface AuthorWorksQueryParams {
  userId: string;
  timeRange?: "30d" | "thisMonth" | "lastMonth" | "all";
  sortField?: "published_at" | "play_count";
  sortDir?: "desc" | "asc";
  pageSize?: number;
  page?: number;
}
export interface AuthorProfileSummary {
  userId: string;
  name: string;
  totalWorksCount: number;
  /** 无可用24h播放样本时为null，不能用0冒充已统计。 */
  averagePlayCount: number | null;
  measuredWorksCount: number;
  completionRatePassCount: number;
  qualityWorksCount: number;
}
export type ContentListItem = AdminContentPageData["videos"][number];
export interface AuthorWorksResponse {
  summary: AuthorProfileSummary;
  works: ContentListItem[];
  snapshots: AdminContentPageData["snapshots"];
  contentQualityByVideoId: AdminContentPageData["contentQualityByVideoId"];
  reviewReadiness: AdminContentPageData["reviewReadiness"];
  evaluationStandards: NonNullable<AdminContentPageData["evaluationStandards"]>;
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export function buildAuthorQuery(params: AuthorWorksQueryParams, now = new Date()): ContentListQuery {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now);
  const range = params.timeRange ?? "30d";
  let startDate = "0001-01-01";
  let endDate = "9999-12-31";
  if (range === "30d") {
    startDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(now.getTime() - 29 * 86400000));
    endDate = today;
  } else if (range === "thisMonth") {
    startDate = `${today.slice(0, 7)}-01`;
    endDate = today;
  } else if (range === "lastMonth") {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00+08:00`);
    endDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(first.getTime() - 86400000));
    startDate = `${endDate.slice(0, 7)}-01`;
  }
  return {
    view: "all", perspective: "team", teamId: null, page: 1, pageSize: 500, cursor: null,
    filters: { ...DEFAULT_CONTENT_LIST_FILTERS, userId: params.userId, timeRange: "custom", startDate, endDate },
    sortField: params.sortField ?? "published_at", sortDir: params.sortDir ?? "desc",
  };
}

export function summarizeAuthorWorks(
  author: { userId: string; name: string },
  data: Pick<AdminContentPageData, "videos" | "snapshots" | "contentQualityByVideoId" | "evaluationStandards">,
  now = new Date(),
): AuthorProfileSummary {
  const snapshots = new Map(data.snapshots.map(s => [s.video_id, s])); // gate:transient-map 单次画像计算的索引，函数返回即释放，不跨请求缓存
  const standards = data.evaluationStandards ?? DEFAULT_EVALUATION_STANDARDS;
  let measuredWorksCount = 0, totalPlays = 0, completionRatePassCount = 0, qualityWorksCount = 0;
  for (const video of data.videos) {
    const snapshot = snapshots.get(video.id);
    const published = video.published_at ? Date.parse(video.published_at) : NaN;
    if (!snapshot || !Number.isFinite(published) || published > now.getTime() - 86400000) continue;
    const play = snapshot.play_count;
    if (play == null || !Number.isFinite(play) || play < 0) continue;
    measuredWorksCount++;
    totalPlays += play;
    const completion = snapshot.completion_rate;
    if (completion != null && completion >= 0 && completion <= 100 &&
      evaluationTone("completionRate", completion, play, standards) === "good") completionRatePassCount++;
    if (data.contentQualityByVideoId[video.id]?.overallGrade === "优") qualityWorksCount++;
  }
  return { ...author, totalWorksCount: data.videos.length, measuredWorksCount,
    averagePlayCount: measuredWorksCount ? Math.floor(totalPlays / measuredWorksCount) : null,
    completionRatePassCount, qualityWorksCount };
}
