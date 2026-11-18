import { useMemo } from "react";
import { summarizeMonthFulfillment } from "@/lib/dashboard-panel-header";
import type { MonthFulfillmentBasis } from "@/lib/loaders/dashboard-fulfillment-marks";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";

/** 工作台页头「本月已交 x 天，漏 y 天」：只把页面状态喂给 `summarizeMonthFulfillment`，口径不在这里。 */
export function useMonthFulfillment({
  today,
  submittedDates,
  exemptionDateBuckets,
  pendingExemptionDates,
  basis,
  profile,
  grants,
}: {
  today: string;
  submittedDates: readonly string[];
  exemptionDateBuckets: { waiveDates: readonly string[]; leaveDates: readonly string[] };
  pendingExemptionDates: readonly string[];
  basis?: MonthFulfillmentBasis;
  profile: ExemptionProfileLike;
  grants: ExemptionGrantLike[];
}) {
  return useMemo(
    () =>
      summarizeMonthFulfillment({
        today,
        submittedDates,
        exemptDates: [...exemptionDateBuckets.waiveDates, ...exemptionDateBuckets.leaveDates, ...pendingExemptionDates],
        ...basis,
        exemptionProfile: profile,
        exemptionGrants: grants,
      }),
    [basis, exemptionDateBuckets, grants, pendingExemptionDates, profile, submittedDates, today],
  );
}
