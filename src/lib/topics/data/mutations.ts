import { toggleTopicLibrary } from "../library";
import { matchTopicGroup } from "../group-matching";
import { isUuidLike, validateRecommendationSubTopicInput, validateSubTopicInput } from "../domain";
import type { ApiResult, TopicGroupOption, TopicMutationActor, TopicOption } from "../domain";
import type { TopicSupabase } from "./types";

export async function loadTopicGroups(supabase: TopicSupabase, topicId: string): Promise<TopicGroupOption[]> {
  const { data, error } = await supabase
    .from("topic_groups")
    .select("id, name")
    .eq("topic_id", topicId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; name: string }>).filter((row) => row.id && row.name);
}

export async function loadTopicOptions(supabase: TopicSupabase): Promise<ApiResult<{ topics: TopicOption[] }>> {
  const { data, error } = await supabase
    .from("topics")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return { ok: false, status: 500, message: error.message };

  const topics = ((data ?? []) as Array<{ id?: unknown; name?: unknown; sort_order?: unknown }>)
    .filter((row) => typeof row.id === "string" && typeof row.name === "string" && row.name.trim())
    .sort((left, right) => {
      const leftOrder = typeof left.sort_order === "number" ? left.sort_order : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.sort_order === "number" ? right.sort_order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || String(left.name).localeCompare(String(right.name), "zh-Hans-CN");
    })
    .map((row) => ({ id: row.id as string, name: row.name as string }));

  return { ok: true, value: { topics } };
}

export async function createSubTopic(supabase: TopicSupabase, userId: string, body: unknown): Promise<ApiResult<unknown>> {
  const validation = validateSubTopicInput(body, "create");
  if (!validation.ok) return validation;

  const groups = await loadTopicGroups(supabase, validation.value.topicId ?? "");
  const groupId = matchTopicGroup(groups, validation.value.title ?? "", validation.value.hook ?? "");
  const payload = {
    title: validation.value.title,
    hook: validation.value.hook,
    topic_id: validation.value.topicId,
    group_id: groupId,
    emotion_tag: validation.value.emotionTag,
    source: validation.value.source ?? "manual",
    audience: validation.value.audience,
    created_by: userId,
  };

  const { data, error } = await supabase.from("sub_topics").insert(payload).select("*").single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}

export async function createSubTopicFromRecommendation(
  supabase: TopicSupabase,
  userId: string,
  body: unknown,
): Promise<ApiResult<unknown>> {
  const validation = validateRecommendationSubTopicInput(body);
  if (!validation.ok) return validation;
  if (!validation.value.category) {
    return { ok: false, status: 400, message: "category 未匹配到现有母题，不能采纳该建议" };
  }

  const { data: topic, error } = await supabase
    .from("topics")
    .select("id")
    .eq("name", validation.value.category)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: "查询母题失败" };
  if (!topic) {
    return { ok: false, status: 400, message: "category 未匹配到现有母题，不能采纳该建议" };
  }

  return createSubTopic(supabase, userId, {
    title: validation.value.title,
    hook: validation.value.hook,
    topic_id: (topic as { id: string }).id,
    emotion_tag: validation.value.emotionTag,
    audience: validation.value.audience,
    source: "ai_recommendation",
  });
}

async function authorizeTopicMutation(
  supabase: TopicSupabase,
  actor: TopicMutationActor,
  id: string,
): Promise<ApiResult<{ id: string; created_by: string; topic_id: string }>> {
  if (!isUuidLike(id)) return { ok: false, status: 400, message: "选题 ID 格式不正确" };
  const { data: existing, error: existingError } = await supabase
    .from("sub_topics")
    .select("id, created_by, topic_id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: "查询选题失败" };
  if (!existing) return { ok: false, status: 404, message: "子题不存在" };
  const row = existing as { id: string; created_by: string; topic_id: string };
  if (row.created_by === actor.actorId) return { ok: true, value: row };
  if (!actor.canReviewContent) return { ok: false, status: 403, message: "无权管理该选题" };

  const { data: creator, error: creatorError } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", row.created_by)
    .maybeSingle();
  if (creatorError) return { ok: false, status: 500, message: "查询选题所属团队失败" };
  if (!creator || (creator as { team_id?: string | null }).team_id !== actor.teamId) {
    return { ok: false, status: 403, message: "无权管理其他团队的选题" };
  }
  return { ok: true, value: row };
}

export async function updateSubTopic(supabase: TopicSupabase, actor: TopicMutationActor, id: string, body: unknown): Promise<ApiResult<unknown>> {
  const validation = validateSubTopicInput(body, "update");
  if (!validation.ok) return validation;
  const authorized = await authorizeTopicMutation(supabase, actor, id);
  if (!authorized.ok) return authorized;
  const existing = authorized.value;

  const topicId = validation.value.topicId ?? (existing as { topic_id: string }).topic_id;
  const nextTitle = validation.value.title;
  const nextHook = validation.value.hook;
  const patch: Record<string, string | null> = {};
  if (nextTitle) patch.title = nextTitle;
  if (nextHook) patch.hook = nextHook;
  if (validation.value.topicId) patch.topic_id = validation.value.topicId;
  if (validation.value.emotionTag !== null) patch.emotion_tag = validation.value.emotionTag;
  if (validation.value.source !== null) patch.source = validation.value.source;
  if (validation.value.audience !== null) patch.audience = validation.value.audience;

  if (nextTitle || nextHook || validation.value.topicId) {
    const groups = await loadTopicGroups(supabase, topicId);
    const { data: current } = await supabase.from("sub_topics").select("title, hook").eq("id", id).single();
    patch.group_id = matchTopicGroup(
      groups,
      nextTitle ?? (current as { title?: string } | null)?.title ?? "",
      nextHook ?? (current as { hook?: string } | null)?.hook ?? "",
    );
  }

  const { data, error } = await supabase.from("sub_topics").update(patch).eq("id", id).select("*").single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}

export async function removeSubTopic(supabase: TopicSupabase, actor: TopicMutationActor, id: string): Promise<ApiResult<{ removed: true }>> {
  const authorized = await authorizeTopicMutation(supabase, actor, id);
  if (!authorized.ok) return authorized;
  const result = await toggleTopicLibrary(supabase, { subTopicId: id, action: "remove", actorId: actor.actorId });
  if (!result.ok) return result;
  return { ok: true, value: { removed: true } };
}

/**
 * V3 多人写作：同一选题允许多人同时写；同一成员对同一选题只有一个有效写作状态，
 * 重复点击保持幂等；不设旧候选上限，不做撞车阻断。
 */
export async function startWritingClaim(supabase: TopicSupabase, userId: string, subTopicId: string): Promise<ApiResult<unknown>> {
  const { data: topic, error: topicError } = await supabase
    .from("sub_topics")
    .select("id, library_status")
    .eq("id", subTopicId)
    .maybeSingle();
  if (topicError) return { ok: false, status: 500, message: topicError.message };
  if (!topic) return { ok: false, status: 404, message: "选题不存在" };
  if ((topic as { library_status?: string }).library_status === "removed") {
    return { ok: false, status: 409, message: "该选题已被移出选题库，不能开始写作" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("sub_topic_claims")
    .select("*")
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message };
  if (existing) return { ok: true, value: existing };

  const { data, error } = await supabase
    .from("sub_topic_claims")
    .insert({ sub_topic_id: subTopicId, user_id: userId, status: "writing" })
    .select("*")
    .single();
  if (error) {
    // 唯一索引兜底：并发重复点击时回读现有写作状态
    // 用 error.code === '23505'（unique_violation）判唯一冲突，不依赖 DB 报错消息串，
    // 避免消息被包装/本地化时第二并发者偶发 500。项目既有约定（dashboard/actions.ts:395、
    // team-join/service.ts:151 等多处同模式）。
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("sub_topic_claims")
        .select("*")
        .eq("sub_topic_id", subTopicId)
        .eq("user_id", userId)
        .eq("status", "writing")
        .maybeSingle();
      if (raced) return { ok: true, value: raced };
    }
    return { ok: false, status: 500, message: error.message };
  }
  return { ok: true, value: data };
}

/** 手动取消写作：只有正在写的记录能取消，幂等。 */
export async function cancelWritingClaim(supabase: TopicSupabase, userId: string, subTopicId: string): Promise<ApiResult<unknown>> {
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, status: 500, message: error.message };
  if (!data) return { ok: false, status: 404, message: "未找到正在写的记录" };
  return { ok: true, value: data };
}

/** 提交关联作品成功后结束正在写；幂等，无在写记录时静默跳过。 */
export async function completeWritingClaim(
  supabase: TopicSupabase,
  userId: string,
  subTopicId: string,
  videoId: string,
): Promise<ApiResult<unknown>> {
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .update({ status: "completed", ended_at: new Date().toISOString(), completed_video_id: videoId })
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}
