import type { SupabaseClient } from "@supabase/supabase-js";
import { matchTopicGroup } from "./group-matching";
import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "./metrics";

export { computeInternalMetrics, buildExternalMetrics } from "./metrics";
export type { TopicInternalMetrics, TopicExternalMetrics } from "./metrics";

export const TOPIC_LIBRARY_QUALIFIED_TAG = "干货";
export const TOPIC_LIBRARY_REVIEW_EXCLUDED_TAGS = ["复盘", "复盘干货"] as const;

export type TopicLibrarySkipReason =
  | "video_not_found"
  | "video_not_active"
  | "review_excluded"
  | "tag_not_qualified"
  | "snapshot_24h_missing"
  | "play_below_threshold"
  | "removed_by_admin";

export type TopicLibraryEntryOutcome =
  | { outcome: "created"; subTopicId: string }
  | { outcome: "already_linked"; subTopicId: string }
  | { outcome: "already_entered"; subTopicId: string }
  | { outcome: "skipped"; reason: TopicLibrarySkipReason };

export type TopicLibraryToggleAction = "remove" | "restore";

export type VideoTopicLibraryStatus =
  | "in_library"
  | "removed"
  | "review_excluded"
  | "ineligible"
  | "pending_entry";

export type ApiFailureResult = { ok: false; status: number; message: string };

export function isReviewExcludedTopicTag(tag: string | null | undefined) {
  if (!tag) return false;
  return (TOPIC_LIBRARY_REVIEW_EXCLUDED_TAGS as readonly string[]).includes(tag.trim());
}

/**
 * 话题标签 → 大盘第四格口径分类。
 * 只有干货走收藏率；复盘、视频转推、标签缺失及一切未知标签都归到点赞率一侧（other 与 review 同显示）。
 * 2026-09-21 阿禅定稿：视频转推不单独处理，其余全部按复盘处理。
 */
export type VideoTopicKind = "dry_goods" | "review" | "other";

export function classifyVideoTopicKind(tag: string | null | undefined): VideoTopicKind {
  const normalized = tag?.trim();
  if (!normalized) return "other";
  if (normalized === TOPIC_LIBRARY_QUALIFIED_TAG) return "dry_goods";
  if (isReviewExcludedTopicTag(normalized)) return "review";
  return "other";
}

export function shouldAutoEnterTopicLibrary(input: {
  topicTag: string | null | undefined;
  hasSnapshot24h: boolean;
  playCount24h: number | null;
}): { ok: true } | { ok: false; reason: TopicLibrarySkipReason } {
  if (isReviewExcludedTopicTag(input.topicTag)) {
    return { ok: false, reason: "review_excluded" };
  }
  if (input.topicTag?.trim() !== TOPIC_LIBRARY_QUALIFIED_TAG) {
    return { ok: false, reason: "tag_not_qualified" };
  }
  if (!input.hasSnapshot24h) {
    return { ok: false, reason: "snapshot_24h_missing" };
  }
  if ((input.playCount24h ?? 0) < TOPIC_LIBRARY_QUALIFY_PLAY_COUNT) {
    return { ok: false, reason: "play_below_threshold" };
  }
  return { ok: true };
}

/**
 * 管理员视角的视频选题库状态。只依据真实数据：话题标签、24h 快照、选题的真实入库状态。
 * 不根据标题/正文猜测干货或复盘，不根据播放量断言已入库。
 */
export function classifyVideoTopicLibraryStatus(input: {
  topicTag: string | null;
  hasSnapshot24h: boolean;
  playCount24h: number | null;
  linkedSubTopic: { id: string; libraryStatus: string } | null;
}): { status: VideoTopicLibraryStatus; subTopicId: string | null } {
  const tag = typeof input.topicTag === "string" ? input.topicTag.trim() : null;
  if (isReviewExcludedTopicTag(tag)) {
    return { status: "review_excluded", subTopicId: null };
  }

  const qualified =
    tag === TOPIC_LIBRARY_QUALIFIED_TAG
    && input.hasSnapshot24h
    && (input.playCount24h ?? 0) >= TOPIC_LIBRARY_QUALIFY_PLAY_COUNT;
  if (!qualified) {
    return { status: "ineligible", subTopicId: null };
  }

  if (!input.linkedSubTopic) {
    return { status: "pending_entry", subTopicId: null };
  }
  return {
    status: input.linkedSubTopic.libraryStatus === "removed" ? "removed" : "in_library",
    subTopicId: input.linkedSubTopic.id,
  };
}

/**
 * 干货视频自动沉淀入库（幂等）。
 * - 话题标签必须精确等于「干货」，复盘类标签无论播放多高都不进入；
 * - 必须存在 24h 快照且播放达到共享入库阈值；
 * - 视频必须处于 active 生命周期；
 * - 已被管理员移出的选题不会因重复触发或数据刷新而自动恢复；
 * - 同一来源视频最多生成一个选题（数据库唯一索引兜底）。
 */
export async function ensureInternalLibraryEntry(
  supabase: SupabaseClient,
  videoId: string,
  verifiedTeamId: string,
): Promise<TopicLibraryEntryOutcome> {
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, user_id, video_title, content, topic_id, lifecycle_state")
    .eq("id", videoId)
    .maybeSingle();
  if (videoError) throw new Error(`加载视频失败：${videoError.message}`);
  const videoRow = video as
    | { id: string; user_id: string; video_title: string | null; content: string | null; topic_id: string | null; lifecycle_state: string | null }
    | null;
  if (!videoRow) return { outcome: "skipped", reason: "video_not_found" };
  const { data: ownerProfile, error: ownerProfileError } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", videoRow.user_id)
    .maybeSingle();
  if (ownerProfileError) throw new Error(`加载视频所属团队失败：${ownerProfileError.message}`);
  if (!ownerProfile || (ownerProfile as { team_id?: string | null }).team_id !== verifiedTeamId) {
    throw new Error("视频不属于当前团队");
  }
  if (videoRow.lifecycle_state !== "active") {
    return { outcome: "skipped", reason: "video_not_active" };
  }

  const { data: topicTagRow, error: tagError } = await supabase
    .from("video_tags")
    .select("tag_value")
    .eq("video_id", videoId)
    .eq("tag_dimension", "话题")
    .maybeSingle();
  if (tagError) throw new Error(`加载话题标签失败：${tagError.message}`);
  const topicTag = (topicTagRow as { tag_value?: string | null } | null)?.tag_value ?? null;

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("video_metrics_snapshots")
    .select("play_count, captured_at")
    .eq("video_id", videoId)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false })
    .limit(1);
  if (snapshotError) throw new Error(`加载24h快照失败：${snapshotError.message}`);
  const snapshot24h = (snapshotRows ?? [{ play_count: null }])[0] as { play_count?: number | null } | undefined;
  const playCount24h = snapshot24h ? Number(snapshot24h.play_count ?? 0) : null;

  const qualification = shouldAutoEnterTopicLibrary({
    topicTag,
    hasSnapshot24h: Boolean(snapshotRows && snapshotRows.length > 0),
    playCount24h,
  });
  if (!qualification.ok) {
    return { outcome: "skipped", reason: qualification.reason };
  }

  // 视频本身已关联某个选题：它就是该视频的选题，不重复新建。
  if (videoRow.topic_id) {
    const { data: linked, error: linkedError } = await supabase
      .from("sub_topics")
      .select("id, library_status")
      .eq("id", videoRow.topic_id)
      .maybeSingle();
    if (linkedError) throw new Error(`加载关联选题失败：${linkedError.message}`);
    if (linked) {
      if ((linked as { library_status?: string }).library_status === "removed") {
        return { outcome: "skipped", reason: "removed_by_admin" };
      }
      return { outcome: "already_linked", subTopicId: (linked as { id: string }).id };
    }
    // 关联选题已不存在（悬空外键），继续走来源视频建题。
  }

  const { data: existing, error: existingError } = await supabase
    .from("sub_topics")
    .select("id, library_status")
    .eq("source_video_id", videoId)
    .maybeSingle();
  if (existingError) throw new Error(`查询已有选题失败：${existingError.message}`);
  if (existing) {
    if ((existing as { library_status?: string }).library_status === "removed") {
      return { outcome: "skipped", reason: "removed_by_admin" };
    }
    return { outcome: "already_entered", subTopicId: (existing as { id: string }).id };
  }

  const title = deriveAutoEntryTitle(videoRow.video_title, videoRow.content);
  const hook = deriveAutoEntryHook(videoRow.content, videoRow.video_title);
  const category = await resolveAutoCategory(supabase, title, hook);

  const payload = {
    title,
    hook,
    topic_id: category.topicId,
    group_id: category.groupId,
    source: "internal_auto",
    source_type: "internal" as const,
    library_status: "in_library" as const,
    source_video_id: videoId,
    created_by: videoRow.user_id,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("sub_topics")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    if (insertError.message.includes("sub_topics_one_internal_per_source_video")) {
      const { data: raced } = await supabase
        .from("sub_topics")
        .select("id, library_status")
        .eq("source_video_id", videoId)
        .maybeSingle();
      if (raced) {
        if ((raced as { library_status?: string }).library_status === "removed") {
          return { outcome: "skipped", reason: "removed_by_admin" };
        }
        return { outcome: "already_entered", subTopicId: (raced as { id: string }).id };
      }
    }
    throw new Error(`创建选题失败：${insertError.message}`);
  }

  return { outcome: "created", subTopicId: (inserted as { id: string }).id };
}

function deriveAutoEntryTitle(videoTitle: string | null, content: string | null) {
  const trimmedTitle = videoTitle?.trim();
  if (trimmedTitle) return trimmedTitle.slice(0, 120);
  const trimmedContent = content?.trim();
  if (trimmedContent) return trimmedContent.slice(0, 80);
  return "未命名干货选题";
}

function deriveAutoEntryHook(content: string | null, videoTitle: string | null) {
  const trimmedContent = content?.trim();
  if (trimmedContent) return trimmedContent.slice(0, 500);
  return videoTitle?.trim().slice(0, 120) ?? "";
}

type AutoCategory = { topicId: string | null; groupId: string | null };

async function resolveAutoCategory(
  supabase: SupabaseClient,
  title: string,
  hook: string,
): Promise<AutoCategory> {
  const { data: groups, error } = await supabase
    .from("topic_groups")
    .select("id, name, topic_id")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`加载选题分组失败：${error.message}`);

  const groupRows = (groups ?? []) as Array<{ id: string; name: string; topic_id: string }>;
  if (!groupRows.length) return { topicId: null, groupId: null };

  const groupId = matchTopicGroup(groupRows, title, hook);
  if (!groupId) return { topicId: null, groupId: null };

  const group = groupRows.find((row) => row.id === groupId);
  return { topicId: group?.topic_id ?? null, groupId: group?.id ?? null };
}

/**
 * 管理员移出 / 恢复选题。只改入库状态与审计，不删除选题、作品、成绩。
 */
export async function toggleTopicLibrary(
  supabase: SupabaseClient,
  input: { subTopicId: string; action: TopicLibraryToggleAction; actorId: string },
): Promise<{ ok: true; value: Record<string, unknown> } | ApiFailureResult> {
  if (typeof (supabase as unknown as { rpc?: unknown }).rpc === "function") {
    const { data, error } = await supabase.rpc("toggle_topic_library_atomic", {
      p_sub_topic_id: input.subTopicId,
      p_action: input.action,
      p_actor_id: input.actorId,
    });
    if (!error) {
      if (data === null) return { ok: false, status: 404, message: "选题不存在" };
      return { ok: true, value: (data ?? {}) as Record<string, unknown> };
    }
    // 应用先于 migration 发布时兼容旧库；其他 RPC 错误不能伪装成功。
    if (error.code !== "PGRST202" && error.code !== "42883") {
      return { ok: false, status: 500, message: "选题库状态更新失败" };
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("sub_topics")
    .select("id, title, library_status, removed_at, removed_by")
    .eq("id", input.subTopicId)
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message };
  const existingRow = existing as { id: string; title: string | null; library_status: string } | null;
  if (!existingRow) return { ok: false, status: 404, message: "选题不存在" };
  const previousState = {
    library_status: existingRow.library_status,
    removed_at: (existingRow as Record<string, unknown>).removed_at ?? null,
    removed_by: (existingRow as Record<string, unknown>).removed_by ?? null,
  };

  const nextStatus = input.action === "remove" ? "removed" : "in_library";
  if (existingRow.library_status === nextStatus) {
    return { ok: true, value: { ...existingRow, library_status: nextStatus } };
  }

  const nowIso = new Date().toISOString();
  const patch = input.action === "remove"
    ? { library_status: nextStatus, removed_at: nowIso, removed_by: input.actorId }
    : { library_status: nextStatus, removed_at: null, removed_by: null };

  const { data: updated, error: updateError } = await supabase
    .from("sub_topics")
    .update(patch)
    .eq("id", input.subTopicId)
    .select("id, title, library_status, removed_at, removed_by")
    .single();
  if (updateError) return { ok: false, status: 500, message: updateError.message };

  const { error: auditError } = await supabase.from("audit_logs").insert({
    user_id: input.actorId,
    action: input.action === "remove" ? "topic_library_remove" : "topic_library_restore",
    target: input.subTopicId,
    detail: JSON.stringify({
      title: existingRow.title,
      previous_status: previousState.library_status,
      next_status: nextStatus,
    }),
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("sub_topics")
      .update({
        library_status: previousState.library_status,
        removed_at: previousState.removed_at,
        removed_by: previousState.removed_by,
      })
      .eq("id", input.subTopicId);
    console.error("[topics-library] 审计写入失败", auditError.message, rollbackError?.message ?? "");
    return { ok: false, status: 500, message: rollbackError ? "选题移出失败，状态回滚未完成" : "选题移出失败，状态已回滚" };
  }

  return { ok: true, value: updated as Record<string, unknown> };
}

const STATUS_QUERY_BATCH_SIZE = 150;

async function selectInBatches<T>(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += STATUS_QUERY_BATCH_SIZE) {
    const batch = ids.slice(index, index + STATUS_QUERY_BATCH_SIZE);
    if (!batch.length) continue;
    const { data, error } = await run(batch);
    if (error) throw new Error(error.message);
    if (data?.length) rows.push(...data);
  }
  return rows;
}

/**
 * 批量解析视频的选题库状态。数据全部来自真实存储：话题标签、24h 快照、选题真实入库状态。
 */
export async function resolveVideoTopicLibraryStatuses(
  supabase: SupabaseClient,
  videos: Array<{ id: string; topic_id?: string | null }>,
): Promise<
  Record<string, { status: VideoTopicLibraryStatus; subTopicId: string | null; topicKind: VideoTopicKind }>
> {
  const videoIds = [...new Set(videos.map((video) => video.id).filter(Boolean))];
  if (!videoIds.length) return {};

  const [tagRows, snapshotRows] = await Promise.all([
    selectInBatches<{ video_id: string; tag_value: string }>(videoIds, (batch) =>
      supabase
        .from("video_tags")
        .select("video_id, tag_value")
        .eq("tag_dimension", "话题")
        .in("video_id", batch),
    ),
    selectInBatches<{ video_id: string; play_count: number | string | null; captured_at: string | null }>(videoIds, (batch) =>
      supabase
        .from("video_metrics_snapshots")
        .select("video_id, play_count, captured_at")
        .eq("snapshot_type", "24h")
        .in("video_id", batch)
        .order("captured_at", { ascending: false }),
    ),
  ]);

  const tagByVideoId = new Map<string, string>();
  for (const row of tagRows) {
    if (row.video_id && !tagByVideoId.has(row.video_id) && typeof row.tag_value === "string") {
      tagByVideoId.set(row.video_id, row.tag_value);
    }
  }
  const playByVideoId = new Map<string, number | null>();
  for (const row of snapshotRows) {
    if (row.video_id && !playByVideoId.has(row.video_id)) {
      playByVideoId.set(row.video_id, Number(row.play_count ?? 0));
    }
  }

  const topicIds = [...new Set(videos.map((video) => video.topic_id).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, { id: string; library_status: string }>();
  if (topicIds.length) {
    const rows = await selectInBatches<{ id: string; library_status: string }>(topicIds, (batch) =>
      supabase.from("sub_topics").select("id, library_status").in("id", batch),
    );
    for (const row of rows) byId.set(row.id, row);
  }
  const bySourceVideoId = new Map<string, { id: string; library_status: string }>();
  const sourceRows = await selectInBatches<{ id: string; library_status: string; source_video_id: string }>(videoIds, (batch) =>
    supabase.from("sub_topics").select("id, library_status, source_video_id").in("source_video_id", batch),
  );
  for (const row of sourceRows) {
    if (row.source_video_id && !bySourceVideoId.has(row.source_video_id)) {
      bySourceVideoId.set(row.source_video_id, row);
    }
  }

  const result: Record<
    string,
    { status: VideoTopicLibraryStatus; subTopicId: string | null; topicKind: VideoTopicKind }
  > = {};
  for (const video of videos) {
    if (!video.id) continue;
    const topicTag = tagByVideoId.get(video.id) ?? null;
    const linked =
      (video.topic_id ? byId.get(video.topic_id) ?? null : null)
      ?? bySourceVideoId.get(video.id)
      ?? null;
    result[video.id] = {
      ...classifyVideoTopicLibraryStatus({
        topicTag,
        hasSnapshot24h: playByVideoId.has(video.id),
        playCount24h: playByVideoId.get(video.id) ?? null,
        linkedSubTopic: linked ? { id: linked.id, libraryStatus: linked.library_status } : null,
      }),
      topicKind: classifyVideoTopicKind(topicTag),
    };
  }
  return result;
}
