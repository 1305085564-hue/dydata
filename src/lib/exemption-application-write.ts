import type { SupabaseClient } from "@supabase/supabase-js";

type ExemptionWriteClient = Pick<SupabaseClient, "from">;

export type PendingExemptionRequestDraft = {
  applicant_user_id: string;
  team_id: string | null;
  exemption_type: string;
  exemption_category: "waive" | "leave";
  start_date: string;
  end_date: string | null;
  reason: string | null;
  /** Database default supplies this for the REST contract. */
  request_status?: "pending";
};

export type ExemptionRequestDateRow = {
  request_id: string;
  request_date: string;
  reason: string | null;
};

type CreatedRequest = Record<string, unknown> & { id: string };

export type ExemptionWriteStage = "requests" | "dates" | "cleanup";

export type ExemptionWriteResult =
  | { ok: true; data: CreatedRequest[] }
  | { ok: false; stage: ExemptionWriteStage; error: unknown };

type ExemptionWriteOptions = {
  /**
   * REST callers need one returned id per segment so they can attach daily
   * rows. Dashboard keeps its historical batch insert contract and omits this.
   */
  dateRowsForDraft?: (
    draft: PendingExemptionRequestDraft,
    created: CreatedRequest,
  ) => ExemptionRequestDateRow[];
  mark?: (stage: ExemptionWriteStage) => void;
};

const CREATED_REQUEST_COLUMNS =
  "id, applicant_user_id, team_id, exemption_type, exemption_category, start_date, end_date, reason, request_status, created_at";

/**
 * 唯一的豁免申请写入编排：
 * - Dashboard 仍一次批量写入申请主表；
 * - REST 仍逐段写入主表，再一次写入逐日明细；
 * - 明细写入失败时，只回收本次刚写入且仍 pending 的主表行。
 * 入口差异留在参数解析和权限层，主表写入与补偿边界集中在这里。
 */
export async function writePendingExemptionRequests(
  supabase: ExemptionWriteClient,
  drafts: readonly PendingExemptionRequestDraft[],
  options: ExemptionWriteOptions = {},
): Promise<ExemptionWriteResult> {
  if (!options.dateRowsForDraft) {
    options.mark?.("requests");
    const { error } = await supabase.from("exemption_request").insert(drafts);
    return error ? { ok: false, stage: "requests", error } : { ok: true, data: [] };
  }

  const created: CreatedRequest[] = [];
  const cleanupCreated = async (): Promise<boolean> => {
    options.mark?.("cleanup");
    let ok = true;
    for (const row of created) {
      const { error } = await supabase
        .from("exemption_request")
        .delete()
        .eq("id", row.id)
        .eq("request_status", "pending");
      if (error) {
        ok = false;
        console.error("[exemptions] failed to cleanup orphan request", row.id, error);
      }
    }
    return ok;
  };

  const dateRows: ExemptionRequestDateRow[] = [];
  for (const draft of drafts) {
    options.mark?.("requests");
    const { data, error } = await supabase
      .from("exemption_request")
      .insert(draft)
      .select(CREATED_REQUEST_COLUMNS)
      .single();

    if (error || !data) {
      await cleanupCreated();
      return { ok: false, stage: "requests", error: error ?? new Error("申请写入未返回记录") };
    }

    const createdRow = data as CreatedRequest;
    created.push(createdRow);
    dateRows.push(...options.dateRowsForDraft(draft, createdRow));
  }

  options.mark?.("dates");
  const { error: dateError } = await supabase
    .from("exemption_request_date")
    .insert(dateRows);
  if (dateError) {
    await cleanupCreated();
    return { ok: false, stage: "dates", error: dateError };
  }

  return { ok: true, data: created };
}
