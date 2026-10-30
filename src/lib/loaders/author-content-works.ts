import { loadAdminContentListData, type AdminContentListArgs, type AdminContentPageData } from "./admin-content-page";
import { buildAuthorQuery, summarizeAuthorWorks, type AuthorWorksQueryParams, type AuthorWorksResponse } from "@/lib/content/author-works-domain";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { AppError } from "@/lib/errors";

/** 不增数据库函数：复用大盘分页，每批500，最多20批；超限/变化明确报错，绝不返回截断画像。 */
export async function loadAuthorContentWorks(
  args: AdminContentListArgs & { scope: NonNullable<AdminContentListArgs["scope"]>; author: { userId: string; name: string; roles?: ("writer" | "talent" | "operator")[] }; params: AuthorWorksQueryParams },
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
  // 仅补当前响应页的元数据；已通过作者可见范围校验，不改大盘/RPC 和统计口径。
  type Report = { video_id: string; report_date: string; script_author_user_id: string | null; video_editor_user_id: string | null; operator_user_id: string | null };
  const reports = new Map<string, Report>(); // gate:transient-map 当前页最多500条，返回即释放
  for (let offset = 0; offset < works.length; offset += 100) {
    const result = await args.supabase.from("daily_reports")
      .select("video_id, report_date, script_author_user_id, video_editor_user_id, operator_user_id")
      .in("video_id", works.slice(offset, offset + 100).map(v => v.id)).eq("is_void", false);
    assertSupabaseQuerySucceeded(result.error, "加载作者作品归属信息失败");
    for (const report of (result.data ?? []) as Report[]) reports.set(report.video_id, report);
  }
  const enrichedWorks = works.map(video => {
    const report = reports.get(video.id);
    // 岗位以小队工种为准；无工种时只接受唯一明确的剪辑署名，不按账号主人猜岗位。
    const roles = args.author.roles ?? [];
    const unambiguousEditor = roles.length === 0 && report?.video_editor_user_id === args.author.userId
      && report.script_author_user_id !== args.author.userId && report.operator_user_id !== args.author.userId;
    const authorRole: AuthorWorksResponse["works"][number]["authorRole"] = roles.length === 1 ? roles[0] : unambiguousEditor ? "editor" : null;
    return { ...video, report_date: report?.report_date ?? null, authorRole };
  });
  const ids = new Set(works.map(v => v.id));
  return {
    summary: summarizeAuthorWorks({ userId: args.author.userId, name: args.author.name }, all, now), works: enrichedWorks,
    snapshots: all.snapshots.filter(s => ids.has(s.video_id)),
    contentQualityByVideoId: Object.fromEntries(Object.entries(all.contentQualityByVideoId).filter(([id]) => ids.has(id))),
    reviewReadiness: Object.fromEntries(Object.entries(all.reviewReadiness).filter(([id]) => ids.has(id))),
    evaluationStandards: all.evaluationStandards!, total: all.videos.length, page, pageSize, hasNextPage: page * pageSize < all.videos.length,
  };
}
