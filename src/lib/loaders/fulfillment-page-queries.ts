import { readQueryPages } from "@/lib/supabase/paged-query";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  materializePendingExemptionRequestRows,
  type PendingExemptionDateLike,
} from "@/lib/豁免";
import type {
  FulfillmentCalendarData,
  FulfillmentPendingExemption,
  FulfillmentTeamOption,
} from "@/types/fulfillment";

// 发布管理加载器的两个辅助查询：团队筛选项、待审批请假。从 fulfillment-page.ts 原样拆出（只搬位置，不改逻辑）。

export async function loadFulfillmentFilterOptions(
  supabase: ReturnType<typeof createAdminClient>,
  visibleUserIds: string[],
): Promise<FulfillmentCalendarData["filterOptions"]> {
  if (visibleUserIds.length === 0) return { teams: [] };

  const { data: profileRows, error } = await readQueryPages((from, to, signal) => supabase
    .from("profiles")
    .select("team_id")
    .in("id", visibleUserIds).order("id", { ascending: true }).range(from, to).abortSignal(signal));

  if (error) {
    throw new Error(error.message || "加载发布管理筛选项失败");
  }

  const teamIds = Array.from(new Set((profileRows ?? []).map((row) => row.team_id).filter(Boolean))) as string[];

  const teamsResult = teamIds.length > 0
    ? await supabase.from("teams").select("id, name").in("id", teamIds).order("name", { ascending: true })
    : { data: [], error: null };

  if (teamsResult.error) throw new Error(teamsResult.error.message || "加载团队筛选项失败");

  return {
    teams: (teamsResult.data ?? []) as FulfillmentTeamOption[],
  };
}

export async function loadPendingExemptions(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    startDate: string;
    endDate: string;
    visibleUserIds: string[];
    teamId: string | null;
  },
): Promise<FulfillmentPendingExemption[]> {
  if (input.visibleUserIds.length === 0) return [];

  let query = supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, start_date, end_date, reason")
    .eq("request_status", "pending")
    .in("applicant_user_id", input.visibleUserIds)
    .lte("start_date", input.endDate)
    .or(`end_date.is.null,end_date.gte.${input.startDate}`);

  if (input.teamId) query = query.eq("team_id", input.teamId);
  const { data, error } = await readQueryPages((from, to, signal) => query.order("created_at", { ascending: false }).order("id").range(from, to).abortSignal(signal));
  if (error) throw new Error(error.message || "加载待审批请假失败");
  const rows = (data ?? []) as FulfillmentPendingExemption[];
  const requestIds = rows.map((row) => row.id).filter(Boolean);
  const detailsResult = requestIds.length > 0
    ? await readQueryPages((from, to, signal) => supabase
        .from("exemption_request_date")
        .select("request_id, request_date, status, reason")
        .in("request_id", requestIds).order("id", { ascending: true }).range(from, to).abortSignal(signal))
    : { data: [] as PendingExemptionDateLike[], error: null };

  if (detailsResult.error) throw new Error(detailsResult.error.message || "加载待审批请假日期失败");

  return materializePendingExemptionRequestRows(
    rows,
    (detailsResult.data ?? []) as PendingExemptionDateLike[],
  ) as FulfillmentPendingExemption[];
}
