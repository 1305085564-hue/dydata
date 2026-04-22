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

  return {
    isExempt: false,
    type: profile.exempt_type,
    category: profile.exempt_type ? category : null,
    label: null,
    detail: null,
    reason: profile.exempt_reason,
  };
}

export function getExemptionDatesForMonth(
  profile: ExemptionProfileLike,
  referenceDate: string,
): ExemptionDateBuckets {
  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

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

  if (!startDate || !endDate) {
    return { waiveDates: [], leaveDates: [] };
  }

  const dates = listDateRange(startDate, endDate);
  return normalizeExemptionCategory(profile.exemption_category) === "leave"
    ? { waiveDates: [], leaveDates: dates }
    : { waiveDates: dates, leaveDates: [] };
}
