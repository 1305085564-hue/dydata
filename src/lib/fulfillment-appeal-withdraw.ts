import type { SupabaseClient } from "@supabase/supabase-js";

export type AppealWithdrawResult =
  | { ok: true; todosClosed: boolean }
  | { ok: false; status: 409 | 500; error: string };

/**
 * 员工撤回自己仍待审批的补交申请。
 * 补交申请表没有"已撤回"状态（状态约束只有 pending/approved/rejected），撤回即删除这一条；
 * 删除条件同时校验"本人 + 仍是待审"，申请刚被管理员处理时删不到，如实告知而不是误删已批结果。
 * 删除成功后关闭管理员那边这条申请的「补交审批」待办，避免待办指向一条已不存在的申请。
 * 待办关闭失败不回滚撤回（申请列表和角标按申请表现算，已经一致），只在返回里标出，由调用方记日志。
 */
export async function withdrawPendingFulfillmentAppeal(input: {
  admin: Pick<SupabaseClient, "from">;
  userId: string;
  appealId: string;
}): Promise<AppealWithdrawResult> {
  const deleted = await input.admin
    .from("fulfillment_appeals")
    .delete()
    .eq("id", input.appealId)
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .select("id");
  if (deleted.error) return { ok: false, status: 500, error: "撤回失败，请稍后重试" };
  if ((deleted.data ?? []).length === 0) {
    return { ok: false, status: 409, error: "这条补交申请已经被管理员处理或不存在，没能撤回" };
  }

  const closed = await input.admin
    .from("notifications")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("category", "todo")
    .eq("source_type", "fulfillment_appeal")
    .eq("source_id", input.appealId)
    .in("status", ["unread", "read"])
    .select("id");
  if (closed.error) console.error(`[appeal-withdraw] appeal ${input.appealId} 已撤回，但关闭管理员待办失败`, closed.error);
  return { ok: true, todosClosed: !closed.error };
}
