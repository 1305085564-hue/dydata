import type { DataAccessScope } from "@/lib/data-access-scope";
import { rankSuggestedSubTopics } from "../domain";
import type { ApiResult, RankedSubTopicSuggestion } from "../domain";
import { normalizeText } from "../domain/internal";
import type { TopicSupabase } from "./types";

export async function suggestSubTopics(supabase: TopicSupabase, scope: DataAccessScope, input: { title: string; content: string }): Promise<ApiResult<RankedSubTopicSuggestion[]>> {
  const title = normalizeText(input.title, 200) ?? "";
  const content = normalizeText(input.content, 2000) ?? "";
  if (!title && !content) return { ok: false, status: 400, message: "title 或 content 至少填一个" };
  const { data, error } = await supabase.from("sub_topics").select("id, title, hook, topics(name), topic_groups(name)").eq("library_status", "in_library").in("created_by", scope.visibleUserIds).order("created_at", { ascending: false }).limit(200);
  if (error) return { ok: false, status: 500, message: error.message };
  const candidates = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), title: String(row.title ?? ""), hook: String(row.hook ?? ""), topicName: typeof (row.topics as { name?: unknown } | null)?.name === "string" ? String((row.topics as { name: string }).name) : null, groupName: typeof (row.topic_groups as { name?: unknown } | null)?.name === "string" ? String((row.topic_groups as { name: string }).name) : null }));
  return { ok: true, value: rankSuggestedSubTopics(candidates, { title, content }) };
}
