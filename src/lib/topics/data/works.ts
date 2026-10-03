import type { DataAccessScope } from "@/lib/data-access-scope";
import { buildWorkContentQualityFromMetrics, type ContentQualityTopicContext } from "@/lib/content-quality";
import { fetchAllQueryPages } from "@/lib/supabase/query-error";
import { computeInternalMetrics } from "../metrics";
import { calculateTopicWorkSummary, selectLatest24hSnapshot } from "../domain";
import type { ApiResult, TopicWorkSort } from "../domain";
import type { TopicSupabase } from "./types";

/** 话题标签批量读取的每批 id 上限：与协作侧 SNAPSHOT_ID_BATCH_SIZE 同量级，防止 .in() URL 过长。 */
const QUALITY_TAG_BATCH_SIZE = 100;

export async function loadSubTopicWorks(
  supabase: TopicSupabase,
  id: string,
  scope: DataAccessScope,
  options: { sort: TopicWorkSort; page: number; pageSize: number },
  preloadedSubTopic?: { topic_id: string | null; group_id: string | null; library_status: string | null },
  options2?: { includeSimilar?: boolean },
): Promise<ApiResult<unknown>> {
  const includeSimilar = options2?.includeSimilar ?? true;
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  // detail 链路传入已取出的子题行，省一次重复查询；独立 /works 入口仍自行查询
  let subTopic: { topic_id?: string | null; group_id?: string | null; library_status?: string | null } | null;
  if (preloadedSubTopic) {
    subTopic = preloadedSubTopic;
  } else {
    const { data, error: subTopicError } = await supabase
      .from("sub_topics")
      .select("id, topic_id, group_id, library_status")
      .eq("id", id)
      .in("created_by", scope.visibleUserIds)
      .maybeSingle();
    if (subTopicError) return { ok: false, status: 500, message: subTopicError.message };
    subTopic = data as { topic_id?: string | null; group_id?: string | null; library_status?: string | null } | null;
  }
  if (!subTopic) return { ok: false, status: 404, message: "子题不存在" };
  if (subTopic.library_status === "removed") {
    return { ok: false, status: 404, message: "该选题已被管理员移出选题库" };
  }

  // 同组子题查询只依赖 topic_id/group_id，与直接作品查询并行
  const siblingsPromise = (async () => {
    const groupId = subTopic?.group_id;
    const topicId = subTopic?.topic_id;
    if (!groupId || !topicId) return [] as Array<{ id: string }>;
    return fetchAllQueryPages<{ id: string }>(
      (from, to) =>
        supabase
          .from("sub_topics")
          .select("id")
          .eq("topic_id", topicId)
          .eq("group_id", groupId)
          .in("created_by", scope.visibleUserIds)
          .neq("id", id)
          .order("id", { ascending: true })
          .range(from, to),
      "加载同组选题失败",
    );
  })();

  let directRows: unknown[] = [];
  let siblings: Array<{ id: string }> = [];
  try {
    const [rows, siblingsResult] = await Promise.all([
      fetchAllQueryPages<Record<string, unknown>>(
        (pageFrom, pageTo) => {
          let directQuery = supabase
            .from("videos")
            .select("id, topic_id, user_id, video_title, content, published_at, uploaded_at, profiles!videos_user_id_fkey(name), video_metrics_snapshots(snapshot_type, captured_at, play_count, likes, comments, shares, favorites, follower_gain, follower_convert)")
            .eq("lifecycle_state", "active")
            .eq("topic_id", id);
          if (scope.kind !== "all") directQuery = directQuery.in("user_id", scope.visibleUserIds);
          return directQuery
            .order("uploaded_at", { ascending: false })
            .order("id", { ascending: true })
            .range(pageFrom, pageTo);
        },
        "加载选题作品失败",
      ),
      siblingsPromise,
    ]);
    directRows = rows;
    siblings = siblingsResult;
  } catch (error) {
    return { ok: false, status: 500, message: error instanceof Error ? error.message : "加载选题作品失败" };
  }

  let similarRows: unknown[] = [];
  const siblingIds = includeSimilar ? siblings.map((row) => row.id) : [];
  if (siblingIds.length) {
    let similarQuery = supabase
      .from("videos")
      .select("id, topic_id, user_id, video_title, content, published_at, uploaded_at, profiles!videos_user_id_fkey(name), video_metrics_snapshots(snapshot_type, captured_at, play_count, likes, comments, shares, favorites, follower_gain, follower_convert)")
      .eq("lifecycle_state", "active")
      .in("topic_id", siblingIds);
    if (scope.kind !== "all") similarQuery = similarQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await similarQuery.limit(20);
    if (error) return { ok: false, status: 500, message: error.message };
    similarRows = data ?? [];
  }

  const allWorkRows = [...directRows, ...similarRows] as Array<Record<string, unknown>>;
  const workIds = allWorkRows
    .map((row) => typeof row.id === "string" ? row.id : null)
    .filter((value): value is string => Boolean(value));
  const qualityTags = new Map<string, string | null>(workIds.map((workId) => [workId, null])); // gate:transient-map 函数内临时聚合，随调用栈释放
  // directRows 走全量分页、条数无上限，话题标签必须分批查询，否则 .in() 会拼出超长 URL
  let qualityTagError: unknown = null;
  for (let index = 0; index < workIds.length; index += QUALITY_TAG_BATCH_SIZE) {
    const batch = workIds.slice(index, index + QUALITY_TAG_BATCH_SIZE);
    const { data, error } = await supabase
      .from("video_tags")
      .select("video_id, tag_value")
      .eq("tag_dimension", "话题")
      .in("video_id", batch);
    if (error) {
      qualityTagError = error;
      break;
    }
    for (const tag of (data ?? []) as Array<{ video_id: string; tag_value: string | null }>) {
      if (qualityTags.has(tag.video_id)) qualityTags.set(tag.video_id, tag.tag_value ?? null);
    }
  }
  const qualityTopics: ContentQualityTopicContext = qualityTagError
    ? { state: "error", tags: new Map() } // gate:transient-map 函数内临时结果，随调用栈释放
    : { state: "ready", tags: qualityTags };

  const withAuthorName = (row: Record<string, unknown>) => {
    const profileName = (row.profiles as { name?: unknown } | null)?.name;
    const videoId = typeof row.id === "string" ? row.id : null;
    const snapshot = selectLatest24hSnapshot(row.video_metrics_snapshots);
    return {
      ...row,
      playCount: snapshot?.playCount ?? null,
      user_name: typeof profileName === "string" ? profileName : null,
      contentQuality: buildWorkContentQualityFromMetrics(
        { videoId, snapshot },
        qualityTopics,
      ),
    };
  };

  const rows: Array<Record<string, unknown> & { referenceType: "direct" }> = [
    ...((directRows ?? []) as Array<Record<string, unknown>>),
  ].map((row) => ({ ...withAuthorName(row), referenceType: "direct" }));
  const sorted = rows.sort((a, b) => {
    if (options.sort === "recent") {
      return (Date.parse(String(b.uploaded_at ?? "")) || 0) - (Date.parse(String(a.uploaded_at ?? "")) || 0);
    }
    const aPlay = typeof a.playCount === "number" ? a.playCount : 0;
    const bPlay = typeof b.playCount === "number" ? b.playCount : 0;
    return bPlay - aPlay;
  });
  const metricRows = rows.map((row) => ({
    playCount: typeof row.playCount === "number" ? row.playCount : null,
    content: typeof row.content === "string" ? row.content : null,
    uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
  }));
  const summary = calculateTopicWorkSummary(metricRows);
  summary.internalMetrics = computeInternalMetrics(metricRows);

  return {
    ok: true,
    value: {
      items: sorted.slice(from, to + 1),
      similarReferences: (similarRows as Array<Record<string, unknown>>).map((row) => ({ ...withAuthorName(row), referenceType: "similar" })),
      summary,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: rows.length,
      },
    },
  };
}
