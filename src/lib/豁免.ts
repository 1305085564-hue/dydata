import { expandShanghaiDateRange } from "@/lib/business-time";
import {
  getEmployeeExemptionCategoryLabel,
  normalizeExemptionCategory,
} from "@/lib/exemption-category";
import type { ExemptionCategory, UserStatus } from "@/types";

export type ExemptionType = "permanent" | "temporary";

export interface ExemptionProfileLike {
  id: string;
  status: UserStatus;
  exempt_type: ExemptionType | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  exemption_category?: ExemptionCategory | null;
}

export interface ExemptionState {
  isExempt: boolean;
  type: ExemptionType | null;
  category: ExemptionCategory | null;
  label: string | null;
  detail: string | null;
  reason: string | null;
}

export interface ExemptionDateBuckets {
  waiveDates: string[];
  leaveDates: string[];
}

export interface ExemptionGrantLike {
  user_id?: string | null;
  start_date: string | null;
  end_date: string | null;
  grant_type: string | null;
  exemption_category?: ExemptionCategory | null;
  status?: string | null;
  created_at?: string | null;
}

export interface PendingExemptionRequestLike {
  id?: string | null;
  start_date: string | null;
  end_date: string | null;
  reason?: string | null;
}

export interface PendingExemptionDateLike {
  request_id?: string | null;
  request_date: string | null;
  status?: string | null;
  reason?: string | null;
}

function formatRangeDetail(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}

function getActiveExemptionDetail(profile: ExemptionProfileLike) {
  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    return "长期";
  }

  if (profile.exempt_start_date && profile.exempt_end_date) {
    return formatRangeDetail(profile.exempt_start_date, profile.exempt_end_date);
  }

  return null;
}

const MAX_PENDING_REQUEST_RANGE_DAYS = 400;

function groupPendingDetailsByRequest(details: PendingExemptionDateLike[]) {
  const byRequest = new Map<string, PendingExemptionDateLike[]>();
  for (const detail of details) {
    if (!detail.request_id) continue;
    const list = byRequest.get(detail.request_id) ?? [];
    list.push(detail);
    byRequest.set(detail.request_id, list);
  }
  return byRequest;
}

function getRequestPendingDates(
  request: PendingExemptionRequestLike,
  detailsByRequest: Map<string, PendingExemptionDateLike[]>,
) {
  const requestDetails = request.id ? detailsByRequest.get(request.id) : undefined;
  if (requestDetails && requestDetails.length > 0) {
    return requestDetails
      .filter((detail) => (detail.status ?? "pending") === "pending")
      .map((detail) => detail.request_date)
      .filter((date): date is string => Boolean(date))
      .sort();
  }

  if (!request.start_date) return [];
  const endDate = request.end_date && request.end_date >= request.start_date
    ? request.end_date
    : request.start_date;
  return expandShanghaiDateRange(request.start_date, endDate, { maxDays: MAX_PENDING_REQUEST_RANGE_DAYS });
}

function getBaseInactiveExemptionState(
  profile: ExemptionProfileLike,
  category: ExemptionCategory,
): ExemptionState {
  return {
    isExempt: false,
    type: profile.exempt_type,
    category: profile.exempt_type ? category : null,
    label: null,
    detail: null,
    reason: profile.exempt_reason,
  };
}

function buildExemptionStateFromGrant(grant: ExemptionGrantLike): ExemptionState {
  const category = normalizeExemptionCategory(grant.exemption_category);
  const isPermanent = grant.grant_type === "permanent";
  const detail =
    isPermanent || !grant.start_date || !grant.end_date
      ? "闀挎湡"
      : formatRangeDetail(grant.start_date, grant.end_date);

  return {
    isExempt: true,
    type: isPermanent ? "permanent" : "temporary",
    category,
    label: getEmployeeExemptionCategoryLabel(category),
    detail,
    reason: null,
  };
}

function getGrantStateForDate(
  grants: ExemptionGrantLike[],
  date: string,
): ExemptionState | null {
  const matchedGrant = grants.find((grant) => {
    if ((grant.status ?? "active") !== "active") return false;
    if (grant.grant_type === "permanent") return true;
    if (!grant.start_date || !grant.end_date) return false;
    return grant.start_date <= date && date <= grant.end_date;
  });

  return matchedGrant ? buildExemptionStateFromGrant(matchedGrant) : null;
}

function dedupeExemptionBuckets(buckets: ExemptionDateBuckets): ExemptionDateBuckets {
  const leaveDates = Array.from(new Set(buckets.leaveDates)).sort();
  const leaveDateSet = new Set(leaveDates);
  const waiveDates = Array.from(
    new Set(buckets.waiveDates.filter((date) => !leaveDateSet.has(date))),
  ).sort();

  return { waiveDates, leaveDates };
}

export function getPendingExemptionDatesFromRequests(
  requests: PendingExemptionRequestLike[],
  details: PendingExemptionDateLike[] = [],
): string[] {
  const detailsByRequest = groupPendingDetailsByRequest(details);
  const dates = new Set<string>();

  for (const request of requests) {
    for (const date of getRequestPendingDates(request, detailsByRequest)) {
      dates.add(date);
    }
  }

  return Array.from(dates).sort();
}

export function materializePendingExemptionRequestRows<T extends PendingExemptionRequestLike>(
  requests: T[],
  details: PendingExemptionDateLike[] = [],
): T[] {
  const detailsByRequest = groupPendingDetailsByRequest(details);
  const rows: T[] = [];

  for (const request of requests) {
    const requestDetails = request.id ? detailsByRequest.get(request.id) : undefined;
    if (requestDetails && requestDetails.length > 0) {
      const pendingDetails = requestDetails
        .filter((detail) => (detail.status ?? "pending") === "pending" && detail.request_date)
        .sort((left, right) => String(left.request_date).localeCompare(String(right.request_date)));

      for (const detail of pendingDetails) {
        rows.push({
          ...request,
          start_date: detail.request_date!,
          end_date: detail.request_date!,
          reason: detail.reason ?? request.reason ?? null,
        });
      }
      continue;
    }

    if (!request.start_date) continue;
    for (const date of getRequestPendingDates(request, detailsByRequest)) {
      rows.push({
        ...request,
        start_date: date,
        end_date: date,
      });
    }
  }

  return rows;
}

export function getExemptionStateForDate(
  profile: ExemptionProfileLike,
  date: string,
  grants: ExemptionGrantLike[] = [],
): ExemptionState {
  const category = normalizeExemptionCategory(profile.exemption_category);

  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    return {
      isExempt: true,
      type: "permanent",
      category,
      label: getEmployeeExemptionCategoryLabel(category),
      detail: getActiveExemptionDetail(profile),
      reason: profile.exempt_reason,
    };
  }

  if (
    profile.exempt_type === "temporary" &&
    profile.exempt_start_date &&
    profile.exempt_end_date &&
    profile.exempt_start_date <= date &&
    date <= profile.exempt_end_date
  ) {
    return {
      isExempt: true,
      type: "temporary",
      category,
      label: getEmployeeExemptionCategoryLabel(category),
      detail: getActiveExemptionDetail(profile),
      reason: profile.exempt_reason,
    };
  }

  const grantState = getGrantStateForDate(grants, date);
  if (grantState) {
    return grantState;
  }

  return getBaseInactiveExemptionState(profile, category);
}

export function getAllExemptionDates(
  profile: ExemptionProfileLike,
  grants: ExemptionGrantLike[] = [],
): ExemptionDateBuckets {
  const buckets: ExemptionDateBuckets = { waiveDates: [], leaveDates: [] };

  if (
    profile.exempt_type === "temporary" &&
    profile.exempt_start_date &&
    profile.exempt_end_date &&
    profile.exempt_start_date <= profile.exempt_end_date
  ) {
    const dates = expandShanghaiDateRange(profile.exempt_start_date, profile.exempt_end_date);
    if (normalizeExemptionCategory(profile.exemption_category) === "leave") {
      buckets.leaveDates.push(...dates);
    } else {
      buckets.waiveDates.push(...dates);
    }
  }

  grants.forEach((grant) => {
    if ((grant.status ?? "active") !== "active") return;
    if (grant.start_date && grant.end_date && grant.start_date <= grant.end_date) {
      const targetKey =
        normalizeExemptionCategory(grant.exemption_category) === "leave"
          ? "leaveDates"
          : "waiveDates";
      buckets[targetKey].push(...expandShanghaiDateRange(grant.start_date, grant.end_date));
    }
  });

  return dedupeExemptionBuckets(buckets);
}
