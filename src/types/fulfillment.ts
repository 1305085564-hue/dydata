export type FulfillmentStatus =
  | "published"
  | "leave"
  | "waived"
  | "absent"
  | "confirmed_published"
  | "exempted"
  | "unconfirmed";

// === 后端 loader 已支持的类型 ===

export interface FulfillmentDateRange {
  preset: "today" | "last7" | "this_month" | "last_month" | "custom" | "month";
  startDate: string;
  endDate: string;
  label: string;
}

export interface FulfillmentTeamOption {
  id: string;
  name: string;
}

export interface FulfillmentScopeFilter {
  teamId: string | null;
  label: string;
}

// === 核心数据类型 ===

export interface FulfillmentDayRecord {
  userId: string;
  userName: string;
  teamId: string | null;
  teamName: string | null;
  date: string;
  status: FulfillmentStatus;
  reason: string;
  markedByName: string;
  /** 标记时间 — 依赖后端 RPC 返回此字段，当前可能为空 */
  markedAt?: string;
  publishedCount: number;
  consecutiveMissing: number;
  pendingExemption?: FulfillmentPendingExemption;
}

export interface FulfillmentPendingExemption {
  id: string;
  applicant_user_id: string;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
}

export interface FulfillmentMemberSummary {
  userId: string;
  userName: string;
  teamId: string | null;
  teamName: string | null;
  totalDays: number;
  publishedDays: number;
  leaveDays: number;
  waivedDays: number;
  absentDays: number;
  unconfirmedDays: number;
  consecutiveMissing: number;
  fulfillmentRate: number;
  publishedCount: number;
  requiredCount: number;
  remainingCount: number;
  days: Record<string, FulfillmentDayRecord>;
}

export interface FulfillmentCalendarData {
  year: number;
  month: number;
  range: FulfillmentDateRange;
  scope: FulfillmentScopeFilter;
  filterOptions: {
    teams: FulfillmentTeamOption[];
  };
  members: FulfillmentMemberSummary[];
  todayExceptions: FulfillmentMemberSummary[];
  rangeExceptions: FulfillmentMemberSummary[];
  stats: {
    totalMembers: number;
    publishedToday: number;
    pendingToday: number;
    leaveToday: number;
    waivedToday: number;
    absentToday: number;
    periodFulfillmentRate: number;
    consecutiveMissingMembers: number;
    publishedCount: number;
    requiredCount: number;
    pendingExemptionRequests: number;
  };
}

export type FulfillmentAppealStatus = "pending" | "approved" | "rejected";

export interface FulfillmentAppeal {
  id: string;
  user_id: string;
  record_date: string;
  reason: string;
  status: FulfillmentAppealStatus;
  handler_id: string | null;
  handled_at: string | null;
  created_at: string;
  user_name: string | null;
  handler_name: string | null;
}

// === 前端新增类型 ===

export type TimeRangePreset = "today" | "last7days" | "thisMonth" | "lastMonth" | "custom";
