import { measureAsync } from "@/lib/perf";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { buildClaimActivity } from "../domain";
import type { ApiFailure, ApiResult, Recent7dHeat } from "../domain";
import { filterRemovedSubTopicRows } from "./summary";
import { loadRecent7dHeat } from "./heat";
import type { TopicSupabase } from "./types";

export async function loadActiveTopics(supabase: TopicSupabase, userId: string, scope: DataAccessScope, limit = 8): Promise<ApiResult<unknown>> {
  type TaskResult<T> = { ok: true; data: T } | ApiFailure;
  const claimsTask = measureAsync("topics.active.claims", async (): Promise<TaskResult<unknown[]>> => {
    let claimsQuery = supabase.from("sub_topic_claims").select("id, sub_topic_id, user_id, status, claimed_at, profiles(name), sub_topics(id, title, library_status)").eq("status", "writing").order("claimed_at", { ascending: false }).limit(limit);
    if (scope.kind !== "all") claimsQuery = claimsQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await claimsQuery;
    if (error) return { ok: false, status: 500, message: error.message };
    return { ok: true, data: filterRemovedSubTopicRows(data ?? []) };
  });
  const recentWorksTask = measureAsync("topics.active.recentWorks", async (): Promise<TaskResult<unknown[]>> => {
    let worksQuery = supabase.from("videos").select("id, topic_id, user_id, video_title, uploaded_at, sub_topics!videos_topic_id_fkey(id, title, library_status)").eq("lifecycle_state", "active").not("topic_id", "is", null).order("uploaded_at", { ascending: false }).limit(limit);
    if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await worksQuery;
    if (error) return { ok: false, status: 500, message: error.message };
    return { ok: true, data: filterRemovedSubTopicRows(data ?? []) };
  });
  const [claimsResult, recentWorksResult] = await Promise.all([claimsTask, recentWorksTask]);
  if (!claimsResult.ok) return claimsResult;
  if (!recentWorksResult.ok) return { ...recentWorksResult, message: "加载最近作品失败" };
  return { ok: true, value: { recentlyClaimed: claimsResult.data, recentlyWorked: recentWorksResult.data } };
}

export async function loadSubTopicClaimActivity(supabase: TopicSupabase, subTopicId: string, scope: DataAccessScope): Promise<ApiResult<unknown>> {
  const [claimsResult, heatResult] = await Promise.all([
    supabase.from("sub_topic_claims").select("user_id, status, claimed_at, profiles(name)").eq("sub_topic_id", subTopicId).eq("status", "writing"),
    loadRecent7dHeat(supabase, [subTopicId], scope),
  ]);
  if (claimsResult.error) return { ok: false, status: 500, message: "加载写作动态失败" };
  let recent7dSummary: Recent7dHeat | null = null;
  try {
    recent7dSummary = heatResult.get(subTopicId) ?? { completedCount: 0, inProgressCount: 0, participants: 0 };
  } catch (err) {
    console.error("[topics] loadSubTopicClaimActivity heatResult.get unexpected throw", err);
    recent7dSummary = null;
  }
  return { ok: true, value: { ...(buildClaimActivity(((claimsResult.data ?? []) as Array<Record<string, unknown> & { user_id?: string | null; status?: string | null; claimed_at?: string | null }>), scope)), recent7dSummary } };
}
