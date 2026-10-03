import type { DataAccessScope } from "@/lib/data-access-scope";
import type { ApiResult } from "../domain";
import { loadSubTopicWorks } from "./works";
import type { TopicSupabase } from "./types";

export async function loadSubTopicDetail(supabase: TopicSupabase, id: string, userId: string, scope: DataAccessScope): Promise<ApiResult<unknown>> {
  const { data: subTopic, error } = await supabase.from("sub_topics").select("*, topics(id, name), topic_groups(id, name)").eq("id", id).in("created_by", scope.visibleUserIds).maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  if (!subTopic) return { ok: false, status: 404, message: "子题不存在" };
  if ((subTopic as { library_status?: string }).library_status === "removed") return { ok: false, status: 404, message: "该选题已被管理员移出选题库" };
  const works = await loadSubTopicWorks(supabase, id, scope, { sort: "best", page: 1, pageSize: 20 }, { topic_id: (subTopic as { topic_id?: string | null }).topic_id ?? null, group_id: (subTopic as { group_id?: string | null }).group_id ?? null, library_status: (subTopic as { library_status?: string }).library_status ?? null }, { includeSimilar: false });
  if (!works.ok) return works;
  return { ok: true, value: { subTopic, works: works.value } };
}
