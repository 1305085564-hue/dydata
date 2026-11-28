import type { SupabaseClient } from "@supabase/supabase-js";
import { readQueryPages } from "@/lib/supabase/paged-query";

/** 履约 RPC 返回「成员 × 日期」行集，不能按一次请求的默认上限读取。
 * 保留现行 RPC 的名称排序；同名成员用成员编号和日期保证分页稳定。
 */
export function loadFulfillmentRangeRows(
  supabase: Pick<SupabaseClient, "rpc">,
  params: { p_start_date: string; p_end_date: string; p_visible_user_ids: string[]; p_team_id: string | null },
) {
  return readQueryPages((from, to, signal) => supabase.rpc("get_fulfillment_range", params)
    .order("team_name", { ascending: true, nullsFirst: false })
    .order("group_name", { ascending: true, nullsFirst: false })
    .order("user_name", { ascending: true })
    .order("user_id", { ascending: true })
    .order("record_date", { ascending: true })
    .range(from, to).abortSignal(signal));
}
