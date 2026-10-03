import type { DataAccessScope } from "@/lib/data-access-scope";
import { fetchAllQueryPages } from "@/lib/supabase/query-error";
import { computeRecent7dHeat } from "../domain";
import type { Recent7dHeat } from "../domain";
import type { TopicSupabase } from "./types";

/** 七天热度数据源：作品按全量成员统计（身份仍受 scope 控制在认领明细里），写作按真实 writing 记录统计。 */
export async function loadRecent7dHeat(
  supabase: TopicSupabase,
  subTopicIds: string[],
  scope: DataAccessScope,
): Promise<Map<string, Recent7dHeat>> {
  if (!subTopicIds.length) return new Map(); // gate:transient-map 函数内临时结果，随调用栈释放
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [works, writings] = await Promise.all([
    fetchAllQueryPages<{ topic_id?: string | null; user_id?: string | null }>(
      (from, to) => {
        let query = supabase
          .from("videos")
          .select("topic_id, user_id")
          .eq("lifecycle_state", "active")
          .gte("uploaded_at", sinceIso)
          .in("topic_id", subTopicIds);
        if (scope.kind !== "all") query = query.in("user_id", scope.visibleUserIds);
        return query
          .order("id", { ascending: true })
          .range(from, to);
      },
      "加载近7天作品失败",
    ),
    fetchAllQueryPages<{ sub_topic_id?: string | null; user_id?: string | null; claimed_at?: string | null }>(
      (from, to) => {
        let query = supabase
          .from("sub_topic_claims")
          .select("sub_topic_id, user_id, claimed_at")
          .eq("status", "writing")
          .in("sub_topic_id", subTopicIds);
        if (scope.kind !== "all") query = query.in("user_id", scope.visibleUserIds);
        return query
          .order("id", { ascending: true })
          .range(from, to);
      },
      "加载近7天写作记录失败",
    ),
  ]);

  const heat = computeRecent7dHeat(
    works.map((row) => ({
      subTopicId: typeof row.topic_id === "string" ? row.topic_id : "",
      userId: typeof row.user_id === "string" ? row.user_id : null,
    })),
    writings.filter((row) => typeof row.claimed_at === "string" && row.claimed_at >= sinceIso).map((row) => ({
      subTopicId: typeof row.sub_topic_id === "string" ? row.sub_topic_id : "",
      userId: typeof row.user_id === "string" ? row.user_id : null,
    })),
  );
  const currentWriters = new Map<string, Set<string>>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const row of writings) {
    if (typeof row.sub_topic_id !== "string" || typeof row.user_id !== "string") continue;
    const users = currentWriters.get(row.sub_topic_id) ?? new Set<string>();
    users.add(row.user_id);
    currentWriters.set(row.sub_topic_id, users);
  }
  for (const subTopicId of subTopicIds) {
    const entry = heat.get(subTopicId) ?? { completedCount: 0, inProgressCount: 0, participants: 0 };
    heat.set(subTopicId, { ...entry, currentWritingCount: currentWriters.get(subTopicId)?.size ?? 0 });
  }
  return heat;
}
