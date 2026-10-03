import type { DataAccessScope } from "@/lib/data-access-scope";
import { measureAsync } from "@/lib/perf";
import { loadActiveTopics } from "./active";
import { loadTopicOptions } from "./mutations";
import { loadTopicPool } from "./pool";
import type { ApiResult, TopicOption } from "../domain";
import { DEFAULT_PAGE_SIZE } from "../domain/internal";
import type { TopicSupabase } from "./types";

/**
 * 选题库首屏读取：一次权限确认后并行准备首屏所需的只读数据，避免客户端
 * 分别请求 active、options、pool 和 my_claims，导致相同的权限与统计工作重复执行。
 */
export async function loadTopicLibraryBootstrap(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
): Promise<ApiResult<{
  active: unknown;
  options: { topics: TopicOption[] };
  pool: unknown;
  myWritingTopicIds: string[];
  currentUserId: string;
}>> {
  const [active, options, pool, writingRowsResult] = await Promise.all([
    loadActiveTopics(supabase, userId, scope, 8),
    loadTopicOptions(supabase),
    loadTopicPool(supabase, userId, scope, {
      view: "all",
      timeRange: "all",
      topicIds: [],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    measureAsync("topics.bootstrap.myWritingIds", async () =>
      supabase
        .from("sub_topic_claims")
        .select("sub_topic_id")
        .eq("user_id", userId)
        .eq("status", "writing"),
    ),
  ]);

  if (!active.ok) return active;
  if (!options.ok) return options;
  if (!pool.ok) return pool;
  if (writingRowsResult.error) {
    return { ok: false, status: 500, message: writingRowsResult.error.message };
  }

  const myWritingTopicIds = Array.from(new Set(
    ((writingRowsResult.data ?? []) as Array<{ sub_topic_id?: unknown }>)
      .map((row) => row.sub_topic_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  return {
    ok: true,
    value: {
      active: active.value,
      options: options.value,
      pool: pool.value,
      myWritingTopicIds,
      currentUserId: userId,
    },
  };
}
