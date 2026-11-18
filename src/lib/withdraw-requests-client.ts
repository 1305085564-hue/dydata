export type WithdrawOutcome = { ok: true; message: string } | { ok: false; error: string };

async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: { error: "网络不稳定，请稍后重试" } };
  }
}

const errorOf = (data: Record<string, unknown>, fallback: string) => (typeof data.error === "string" && data.error ? data.error : fallback);

/** 撤回自己所有待审批的请假/免交申请（工作台通知条上的"待审批"是汇总展示，撤回范围与之一致）。 */
export async function withdrawMyPendingExemptions(): Promise<WithdrawOutcome> {
  const { ok, data } = await post("/api/exemptions/withdraw", {});
  if (!ok) return { ok: false, error: errorOf(data, "撤回失败，请稍后重试") };
  const skipped = typeof data.skippedReviewed === "number" ? data.skippedReviewed : 0;
  return { ok: true, message: skipped > 0 ? `已撤回，另有 ${skipped} 份已被部分审批，不能撤回` : "已撤回申请" };
}

/** 撤回一条待审批的补交申请。 */
export async function withdrawMyFulfillmentAppeal(appealId: string): Promise<WithdrawOutcome> {
  const { ok, data } = await post("/api/fulfillment/appeal/withdraw", { appealId });
  return ok ? { ok: true, message: "已撤回补交申请" } : { ok: false, error: errorOf(data, "撤回失败，请稍后重试") };
}
