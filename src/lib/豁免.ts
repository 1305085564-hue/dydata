import type { UserStatus } from "@/types";

export type ExemptionType = "permanent" | "temporary";
export type ExemptionMode = "none" | "permanent" | "temporary-single" | "temporary-range";

export interface ExemptionProfileLike {
  id: string;
  status: UserStatus;
  exempt_type: ExemptionType | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
}

export interface ExemptionFormValues {
  userId: string;
  mode: ExemptionMode;
  date?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export interface ExemptionState {
  isExempt: boolean;
  type: ExemptionType | null;
  label: string | null;
  reason: string | null;
}

function normalizeReason(reason?: string) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

function formatRangeLabel(startDate: string, endDate: string) {
  return startDate === endDate ? `临时 ${startDate}` : `临时 ${startDate} ~ ${endDate}`;
}

function formatDateDetail(values: ExemptionFormValues) {
  if (values.mode === "temporary-single") {
    return values.date;
  }

  if (values.mode === "temporary-range") {
    return `${values.startDate} ~ ${values.endDate}`;
  }

  return null;
}

export function buildExemptionFields(values: ExemptionFormValues): ExemptionProfileLike {
  const reason = normalizeReason(values.reason);

  if (values.mode === "none") {
    return {
      id: values.userId,
      status: "active",
      exempt_type: null,
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: null,
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
    };
  }

  const startDate = values.mode === "temporary-single" ? values.date : values.startDate;
  const endDate = values.mode === "temporary-single" ? values.date : values.endDate;

  if (!startDate || !endDate) {
    throw new Error("临时豁免必须填写日期");
  }

  if (startDate > endDate) {
    throw new Error("开始日期不能晚于结束日期");
  }

  return {
    id: values.userId,
    status: "active",
    exempt_type: "temporary",
    exempt_start_date: startDate,
    exempt_end_date: endDate,
    exempt_reason: reason,
  };
}

export function deriveExemptionFormValues(profile: ExemptionProfileLike): ExemptionFormValues {
  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    return {
      userId: profile.id,
      mode: "permanent",
      reason: profile.exempt_reason ?? undefined,
    };
  }

  if (profile.exempt_type === "temporary" && profile.exempt_start_date && profile.exempt_end_date) {
    if (profile.exempt_start_date === profile.exempt_end_date) {
      return {
        userId: profile.id,
        mode: "temporary-single",
        date: profile.exempt_start_date,
        reason: profile.exempt_reason ?? undefined,
      };
    }

    return {
      userId: profile.id,
      mode: "temporary-range",
      startDate: profile.exempt_start_date,
      endDate: profile.exempt_end_date,
      reason: profile.exempt_reason ?? undefined,
    };
  }

  return {
    userId: profile.id,
    mode: "none",
    reason: profile.exempt_reason ?? undefined,
  };
}

export function formatExemptionDetail(values: ExemptionFormValues) {
  const reason = normalizeReason(values.reason);

  if (values.mode === "none") {
    return "清除豁免";
  }

  if (values.mode === "permanent") {
    return reason ? `永久豁免｜原因：${reason}` : "永久豁免";
  }

  const dateDetail = formatDateDetail(values);
  const parts = ["临时豁免"];

  if (dateDetail) {
    parts.push(`日期：${dateDetail}`);
  }

  if (reason) {
    parts.push(`原因：${reason}`);
  }

  return parts.join("｜");
}

export function getExemptionStateForDate(profile: ExemptionProfileLike, date: string): ExemptionState {
  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    return {
      isExempt: true,
      type: "permanent",
      label: "永久豁免",
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
      label: formatRangeLabel(profile.exempt_start_date, profile.exempt_end_date),
      reason: profile.exempt_reason,
    };
  }

  return {
    isExempt: false,
    type: profile.exempt_type,
    label:
      profile.exempt_type === "temporary" && profile.exempt_start_date && profile.exempt_end_date
        ? formatRangeLabel(profile.exempt_start_date, profile.exempt_end_date)
        : null,
    reason: profile.exempt_reason,
  };
}
