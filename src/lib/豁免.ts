import type { ExemptionCategory, UserStatus } from "@/types";

export type ExemptionType = "permanent" | "temporary";
export type ExemptionMode = "none" | "permanent" | "yesterday" | "range";

export interface ExemptionProfileLike {
  id: string;
  status: UserStatus;
  exempt_type: ExemptionType | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  exemption_category?: ExemptionCategory | null;
}

export interface ExemptionFormValues {
  userId: string;
  mode: ExemptionMode;
  category: ExemptionCategory;
  date?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
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

export function normalizeExemptionCategory(
  category?: ExemptionCategory | null,
): ExemptionCategory {
  return category === "leave" ? "leave" : "waive";
}

export function getExemptionCategoryLabel(category?: ExemptionCategory | null) {
  return normalizeExemptionCategory(category) === "leave" ? "请假" : "免交";
}

function normalizeReason(reason?: string) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

function formatRangeDetail(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}

function formatModeLabel(mode: ExemptionMode) {
  if (mode === "permanent") return "长期";
  if (mode === "yesterday") return "单日";
  if (mode === "range") return "多日";
  return "正常";
}

function formatDateDetail(values: ExemptionFormValues) {
  if (values.mode === "yesterday") {
    return values.date;
  }

  if (values.mode === "range") {
    if (!values.startDate || !values.endDate) return null;
    return formatRangeDetail(values.startDate, values.endDate);
  }

  return null;
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

function listDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const boundary = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor.getTime() <= boundary.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
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
    label: getExemptionCategoryLabel(category),
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

function appendGrantDates(
  buckets: ExemptionDateBuckets,
  grant: ExemptionGrantLike,
  monthStart: string,
  monthEnd: string,
) {
  if ((grant.status ?? "active") !== "active") return;

  let startDate: string | null = null;
  let endDate: string | null = null;

  if (grant.grant_type === "permanent") {
    startDate = monthStart;
    endDate = monthEnd;
  } else if (grant.start_date && grant.end_date) {
    startDate = grant.start_date > monthStart ? grant.start_date : monthStart;
    endDate = grant.end_date < monthEnd ? grant.end_date : monthEnd;
    if (startDate > endDate) return;
  }

  if (!startDate || !endDate) return;

  const targetKey =
    normalizeExemptionCategory(grant.exemption_category) === "leave"
      ? "leaveDates"
      : "waiveDates";

  buckets[targetKey].push(...listDateRange(startDate, endDate));
}

function dedupeExemptionBuckets(buckets: ExemptionDateBuckets): ExemptionDateBuckets {
  const leaveDates = Array.from(new Set(buckets.leaveDates)).sort();
  const leaveDateSet = new Set(leaveDates);
  const waiveDates = Array.from(
    new Set(buckets.waiveDates.filter((date) => !leaveDateSet.has(date))),
  ).sort();

  return { waiveDates, leaveDates };
}

export function buildExemptionFields(values: ExemptionFormValues): ExemptionProfileLike {
  const reason = normalizeReason(values.reason);
  const category = normalizeExemptionCategory(values.category);

  if (values.mode === "none") {
    return {
      id: values.userId,
      status: "active",
      exempt_type: null,
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: null,
      exemption_category: null,
    };
  }

  if (values.mode === "permanent") {
    return {
      id: values.userId,
      status: "exempt",
      exempt_type: "permanent",
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: reason,
      exemption_category: category,
    };
  }

  const startDate = values.mode === "yesterday" ? values.date : values.startDate;
  const endDate = values.mode === "yesterday" ? values.date : values.endDate;

  if (!startDate || !endDate) {
    throw new Error(values.mode === "range" ? "多日豁免必须填写日期" : "单日豁免必须填写日期");
  }

  if (startDate > endDate) {
    throw new Error("开始日期不能晚于结束日期");
  }

  if (values.mode === "range") {
    const days =
      Math.floor(
        (new Date(`${endDate}T00:00:00.000Z`).getTime() -
          new Date(`${startDate}T00:00:00.000Z`).getTime()) /
          86400000,
      ) + 1;
    if (days < 2) {
      throw new Error("多日豁免至少选择2天");
    }
  }

  return {
    id: values.userId,
    status: "active",
    exempt_type: "temporary",
    exempt_start_date: startDate,
    exempt_end_date: endDate,
    exempt_reason: reason,
    exemption_category: category,
  };
}

export function deriveExemptionFormValues(
  profile: ExemptionProfileLike,
): ExemptionFormValues {
  const category = normalizeExemptionCategory(profile.exemption_category);

  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    return {
      userId: profile.id,
      mode: "permanent",
      category,
      reason: profile.exempt_reason ?? undefined,
    };
  }

  if (
    profile.exempt_type === "temporary" &&
    profile.exempt_start_date &&
    profile.exempt_end_date
  ) {
    if (profile.exempt_start_date === profile.exempt_end_date) {
      return {
        userId: profile.id,
        mode: "yesterday",
        category,
        date: profile.exempt_start_date,
        reason: profile.exempt_reason ?? undefined,
      };
    }

    return {
      userId: profile.id,
      mode: "range",
      category,
      startDate: profile.exempt_start_date,
      endDate: profile.exempt_end_date,
      reason: profile.exempt_reason ?? undefined,
    };
  }

  return {
    userId: profile.id,
    mode: "none",
    category,
    reason: profile.exempt_reason ?? undefined,
  };
}

export function formatExemptionDetail(values: ExemptionFormValues) {
  const reason = normalizeReason(values.reason);
  const categoryLabel = getExemptionCategoryLabel(values.category);

  if (values.mode === "none") {
    return "清除豁免";
  }

  const parts = [categoryLabel, formatModeLabel(values.mode)];
  const dateDetail = formatDateDetail(values);

  if (dateDetail) {
    parts.push(`日期：${dateDetail}`);
  }

  if (reason) {
    parts.push(`原因：${reason}`);
  }

  return parts.join("｜");
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
      label: getExemptionCategoryLabel(category),
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
      label: getExemptionCategoryLabel(category),
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

export function getExemptionDatesForMonth(
  profile: ExemptionProfileLike,
  referenceDate: string,
  grants: ExemptionGrantLike[] = [],
): ExemptionDateBuckets {
  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const monthStartKey = monthStart.toISOString().slice(0, 10);
  const monthEndKey = monthEnd.toISOString().slice(0, 10);

  let startDate: string | null = null;
  let endDate: string | null = null;

  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    startDate = monthStart.toISOString().slice(0, 10);
    endDate = monthEnd.toISOString().slice(0, 10);
  } else if (
    profile.exempt_type === "temporary" &&
    profile.exempt_start_date &&
    profile.exempt_end_date
  ) {
    startDate =
      profile.exempt_start_date > monthStart.toISOString().slice(0, 10)
        ? profile.exempt_start_date
        : monthStart.toISOString().slice(0, 10);
    endDate =
      profile.exempt_end_date < monthEnd.toISOString().slice(0, 10)
        ? profile.exempt_end_date
        : monthEnd.toISOString().slice(0, 10);

    if (startDate > endDate) {
      startDate = null;
      endDate = null;
    }
  }

  const buckets: ExemptionDateBuckets = { waiveDates: [], leaveDates: [] };

  if (startDate && endDate) {
    const dates = listDateRange(startDate, endDate);
    if (normalizeExemptionCategory(profile.exemption_category) === "leave") {
      buckets.leaveDates.push(...dates);
    } else {
      buckets.waiveDates.push(...dates);
    }
  }

  grants.forEach((grant) => appendGrantDates(buckets, grant, monthStartKey, monthEndKey));

  return dedupeExemptionBuckets(buckets);
}
