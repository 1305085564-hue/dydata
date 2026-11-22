import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { ContentListQuery } from "./domain/content-list-query";
import { DEFAULT_CONTENT_LIST_FILTERS } from "@/lib/content/domain/content-list-filters";
import { DEFAULT_EVALUATION_STANDARDS, evaluationTone } from "@/lib/evaluation-standards";
import { averagePlayOf } from "@/lib/metrics/caliber";
import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";

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
  works: (ContentListItem & {
    /** 当前作者在该作品的唯一已确认岗位；缺失或兼岗有歧义时不提供直达入口。 */
    authorRole?: "talent" | "operator" | "writer" | "editor" | null;
    report_date?: string | null;
  })[];
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
  const today = formatShanghaiDateOnly(now);
  const range = params.timeRange ?? "30d";
  let startDate = "0001-01-01";
  let endDate = "9999-12-31";
  if (range === "30d") {
    startDate = shiftDateOnly(now, -29);
    endDate = today;
  } else if (range === "thisMonth") {
    startDate = `${today.slice(0, 7)}-01`;
    endDate = today;
  } else if (range === "lastMonth") {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00+08:00`);
    endDate = shiftDateOnly(first, -1);
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
  const plays: number[] = [];
  let completionRatePassCount = 0, qualityWorksCount = 0;
  for (const video of data.videos) {
    const snapshot = snapshots.get(video.id);
    const published = video.published_at ? Date.parse(video.published_at) : NaN;
    if (!snapshot || !Number.isFinite(published) || published > now.getTime() - 86400000) continue;
    const play = snapshot.play_count;
    if (play == null || !Number.isFinite(play) || play < 0) continue;
    plays.push(play);
    const completion = snapshot.completion_rate;
    if (completion != null && completion >= 0 && completion <= 100 &&
      evaluationTone("completionRate", completion, play, standards) === "good") completionRatePassCount++;
    if (data.contentQualityByVideoId[video.id]?.overallGrade === "优") qualityWorksCount++;
  }
  // 条均播放与数据管理同一口径（averagePlayOf：>= 2000 才计入）；有效样本数仍含低播放作品
  return { ...author, totalWorksCount: data.videos.length, measuredWorksCount: plays.length,
    averagePlayCount: plays.length ? averagePlayOf(plays) : null,
    completionRatePassCount, qualityWorksCount };
}
