import { readQueryPages } from "@/lib/supabase/paged-query";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WithdrawResult =
  | { ok: true; withdrawn: number; skippedReviewed: number }
  | { ok: false; status: 409 | 500; error: string };

/**
 * 员工撤回自己仍待审批的请假/免交申请。
 * 数据库只允许申请人删除自己 pending 的申请（RLS「成员删除自己待审批的申请」），逐日明细随申请级联删除。
 * 申请里已有日期被管理员审过（部分通过/驳回）的不能整单撤回：删除会连带抹掉已审结果，所以跳过。
 * 管理员侧的待办、角标都是按待审申请现算的，申请删掉即同步消失，没有另存的通知需要关闭。
 */
export async function withdrawPendingExemptionRequests(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<WithdrawResult> {
  const pending = await readQueryPages((from, to, signal) => supabase
    .from("exemption_request")
    .select("id")
    .eq("applicant_user_id", userId)
    .eq("request_status", "pending").order("id", { ascending: true }).range(from, to).abortSignal(signal));
  if (pending.error) return { ok: false, status: 500, error: "读取待审批申请失败，请稍后重试" };
  const pendingIds = ((pending.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (pendingIds.length === 0) return { ok: false, status: 409, error: "没有待审批的申请可以撤回，可能已经被管理员处理" };

  const reviewed = await readQueryPages((from, to, signal) => supabase
    .from("exemption_request_date")
    .select("request_id")
    .in("request_id", pendingIds)
    .neq("status", "pending").order("id", { ascending: true }).range(from, to).abortSignal(signal));
  if (reviewed.error) return { ok: false, status: 500, error: "核对审批进度失败，请稍后重试" };
  const reviewedIds = new Set(((reviewed.data ?? []) as Array<{ request_id: string }>).map((row) => row.request_id));
  const withdrawableIds = pendingIds.filter((id) => !reviewedIds.has(id));
  if (withdrawableIds.length === 0) return { ok: false, status: 409, error: "这份申请已有日期被管理员审批，不能撤回" };

  const deleted = await supabase
    .from("exemption_request")
    .delete()
    .in("id", withdrawableIds)
    .eq("applicant_user_id", userId)
    .eq("request_status", "pending")
    .select("id");
  if (deleted.error) return { ok: false, status: 500, error: "撤回失败，请稍后重试" };
  const withdrawn = (deleted.data ?? []).length;
  if (withdrawn === 0) return { ok: false, status: 409, error: "申请刚刚被管理员处理，没能撤回" };
  return { ok: true, withdrawn, skippedReviewed: pendingIds.length - withdrawableIds.length };
}
