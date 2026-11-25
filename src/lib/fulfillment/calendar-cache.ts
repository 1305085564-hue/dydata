import { BoundedTtlCache } from "@/lib/cache-policy";
import type { FulfillmentCalendarData } from "@/types/fulfillment";

const calendarCache = new BoundedTtlCache<FulfillmentCalendarData>({
  scope: "company", ttlMs: 60_000, maxEntries: 32, name: "fulfillment-calendar",
}, () => Date.now());
let generation = 0;

export type CalendarCacheScope = {
  companyId: string | null;
  visibleUserIds: string[];
  teamId?: string | null;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  today: string;
};

export function clearFulfillmentCalendarCache() {
  generation += 1;
  calendarCache.clear();
}

export function fulfillmentCalendarCacheStats() { return calendarCache.stats; }

/** 只缓存成功结果；失效前发出的读取不能在写入之后重新污染缓存。 */
export async function cachedFulfillmentCalendar(
  scope: CalendarCacheScope,
  load: () => Promise<FulfillmentCalendarData>,
  fresh = false,
) {
  const key = JSON.stringify([
    process.env.CLOUDBASE_ENV_ID ?? process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    scope.companyId, scope.teamId ?? null, [...scope.visibleUserIds].sort(),
    scope.year, scope.month, scope.startDate, scope.endDate, scope.today,
  ]);
  if (fresh) clearFulfillmentCalendarCache();
  const cached = calendarCache.get(key);
  if (cached) return cached;
  const startedGeneration = generation;
  const result = await load();
  if (generation === startedGeneration) calendarCache.set(key, result);
  return result;
}

/** 月历的写依赖集中登记；遥测、通知等表写入不会冲掉业务缓存。 */
const fulfillmentWriteResources = new Set([
  "profiles", "teams", "videos", "daily_reports", "fulfillment_records",
  "exemption_request", "exemption_request_date", "exemption_grant",
  "rpc/mark_fulfillment_status", "rpc/mark_fulfillment_status_batch", "rpc/remove_fulfillment_mark",
  "rpc/handle_fulfillment_appeal", "rpc/reopen_fulfillment_appeal_atomically",
  "rpc/review_exemption_request_atomically", "rpc/review_exemption_request_dates_atomically",
  "rpc/set_permanent_exemption_owner_atomically", "rpc/clear_permanent_exemption_owner_atomically",
  "rpc/reopen_exemption_request_atomically", "rpc/admin_grant_exemption_for_dates",
  "rpc/update_history_report_edit_atomic", "rpc/transition_video_lifecycle_with_report_link",
  "rpc/rollback_new_video_submission", "rpc/cloudbase_register_employee", "rpc/cloudbase_rollback_registered_employee",
]);

export function invalidateFulfillmentTableWrite(url: string, method: string, succeeded: boolean) {
  const resource = new URL(url).pathname.split("/rest/")[1];
  if (succeeded && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && fulfillmentWriteResources.has(resource)) {
    clearFulfillmentCalendarCache();
  }
}
