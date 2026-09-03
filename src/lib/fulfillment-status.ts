import type { FulfillmentStatus } from "@/types/fulfillment";

export const FULFILLED_FULFILLMENT_STATUSES = ["published", "confirmed_published"] as const;
export const WAIVED_FULFILLMENT_STATUSES = ["waived", "exempted"] as const;
export const REQUIRED_EXCLUDED_FULFILLMENT_STATUSES = ["leave", ...WAIVED_FULFILLMENT_STATUSES] as const;
export const MANUAL_FULFILLMENT_MARK_STATUSES = ["leave", "waived", "absent", "confirmed_published"] as const;
export const MANUAL_FULFILLMENT_MARK_STATUS_MESSAGE = "leave/waived/absent/confirmed_published";

export type ManualFulfillmentMarkStatus = (typeof MANUAL_FULFILLMENT_MARK_STATUSES)[number];

export function isFulfilledFulfillmentStatus(status: FulfillmentStatus | null | undefined) {
  return (FULFILLED_FULFILLMENT_STATUSES as readonly string[]).includes(status ?? "");
}

export function isWaivedFulfillmentStatus(status: FulfillmentStatus | null | undefined) {
  return (WAIVED_FULFILLMENT_STATUSES as readonly string[]).includes(status ?? "");
}

export function countsTowardFulfillmentRequirement(status: FulfillmentStatus | null | undefined) {
  return !(REQUIRED_EXCLUDED_FULFILLMENT_STATUSES as readonly string[]).includes(status ?? "");
}

export function isManualFulfillmentMarkStatus(status: string | null | undefined): status is ManualFulfillmentMarkStatus {
  return (MANUAL_FULFILLMENT_MARK_STATUSES as readonly string[]).includes(status ?? "");
}
