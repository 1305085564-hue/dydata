import { loadAdminContentListData, type AdminContentListArgs, type AdminContentPageData } from "./admin-content-page";
import { buildAuthorQuery, summarizeAuthorWorks, type AuthorWorksQueryParams, type AuthorWorksResponse } from "@/lib/content/author-works-domain";
import { AppError } from "@/lib/errors";

/** 不增数据库函数：复用大盘分页，每批500，最多20批；超限/变化明确报错，绝不返回截断画像。 */
export async function loadAuthorContentWorks(
  args: AdminContentListArgs & { scope: NonNullable<AdminContentListArgs["scope"]>; author: { userId: string; name: string }; params: AuthorWorksQueryParams },
  loadList = loadAdminContentListData,
  now = new Date(),
): Promise<AuthorWorksResponse> {
  if (!args.scope.visibleUserIds.includes(args.author.userId)) throw new AppError({ message: "作者作品加载失败", code: "FORBIDDEN" });
  const query = { ...buildAuthorQuery({ ...args.params, userId: args.author.userId }, now), teamId: args.scope.teamId };
  const all: AdminContentPageData = { videos: [], snapshots: [], profiles: [], contentQualityByVideoId: {}, reviewReadiness: {}, summary: { totalVideos: 0 } };
  let expectedTotal: number | undefined;
  const seen = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const data = await loadList({ ...args, query: { ...query, page } });
    expectedTotal ??= data.summary.totalVideos;
    if (expectedTotal > 10000) throw new AppError({ message: "作者作品加载失败", code: "INVALID_INPUT", publicMessage: "作品超过单次统计上限，请缩小时间范围" });
    if (data.summary.totalVideos !== expectedTotal || data.videos.some(v => seen.has(v.id))) {
      throw new AppError({ message: "作者作品加载失败", code: "CONFLICT", publicMessage: "作品列表刚刚更新，请重试" });
    }
    for (const video of data.videos) seen.add(video.id);
    all.videos.push(...data.videos);
    all.snapshots.push(...data.snapshots);
    Object.assign(all.contentQualityByVideoId, data.contentQualityByVideoId);
    Object.assign(all.reviewReadiness, data.reviewReadiness);
    all.evaluationStandards = data.evaluationStandards;
    if (seen.size >= expectedTotal) break;
    if (data.videos.length === 0 || page === 20) throw new AppError({ message: "作者作品加载失败", code: "CONFLICT", publicMessage: "作品统计未完成，请重试" });
  }
  const page = args.params.page ?? 1;
  const pageSize = args.params.pageSize ?? 100;
  const works = all.videos.slice((page - 1) * pageSize, page * pageSize);
  const ids = new Set(works.map(v => v.id));
  return {
    summary: summarizeAuthorWorks(args.author, all, now), works,
    snapshots: all.snapshots.filter(s => ids.has(s.video_id)),
    contentQualityByVideoId: Object.fromEntries(Object.entries(all.contentQualityByVideoId).filter(([id]) => ids.has(id))),
    reviewReadiness: Object.fromEntries(Object.entries(all.reviewReadiness).filter(([id]) => ids.has(id))),
    evaluationStandards: all.evaluationStandards!, total: all.videos.length, page, pageSize, hasNextPage: page * pageSize < all.videos.length,
  };
}
