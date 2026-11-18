import { useCallback, useEffect, useState } from "react";

import type { UserExemptionReviewNotice } from "@/lib/loaders/dashboard-exemption-review";

/** 同一组审批结果的关闭标记：任何一条申请有新的审批结果（处理时间变了）就重新出现。 */
export function reviewNoticeDismissKey(notices: readonly UserExemptionReviewNotice[]) {
  if (notices.length === 0) return null;
  const stamp = notices.map((notice) => {
    const times = [notice.reviewed_at, ...(notice.daily_results ?? []).map((item) => item.reviewed_at)].filter(Boolean);
    return `${notice.id || notice.created_at || "review"}@${times.sort().at(-1) ?? ""}`;
  });
  return `dydata:notice:${stamp.join("|")}`;
}

/** 工作台面板与表单共用：审批结果提示本会话内关闭后不再弹出。 */
export function useReviewNoticeDismissal(notices: readonly UserExemptionReviewNotice[]) {
  const key = reviewNoticeDismissKey(notices);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!key) return;
    let next = false;
    try {
      next = window.sessionStorage.getItem(key) === "dismissed";
    } catch {}
    const timeoutId = window.setTimeout(() => setDismissed(next), 0);
    return () => window.clearTimeout(timeoutId);
  }, [key]);

  const dismiss = useCallback(() => {
    if (!key) return;
    setDismissed(true);
    try {
      window.sessionStorage.setItem(key, "dismissed");
    } catch {}
  }, [key]);

  return { dismissed, dismiss };
}
