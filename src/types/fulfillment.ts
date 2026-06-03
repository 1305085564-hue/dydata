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

export interface FulfillmentGroupOption {
  id: string;
  name: string;
  teamId: string | null;
}

export interface FulfillmentScopeFilter {
  teamId: string | null;
  groupId: string | null;
  label: string;
}

// === 核心数据类型 ===

export interface FulfillmentDayRecord {
  userId: string;
  userName: string;
  teamId: string | null;
  teamName: string | null;
  groupId: string | null;
  groupName: string | null;
  date: string;
  status: FulfillmentStatus;
  reason: string;
  markedByName: string;
  /** 标记时间 — 依赖后端 RPC 返回此字段，当前可能为空 */
  markedAt?: string;
  publishedCount: number;
  consecutiveMissing: number;
}

export interface FulfillmentMemberSummary {
  userId: string;
  userName: string;
  teamId: string | null;
  teamName: string | null;
  groupId: string | null;
  groupName: string | null;
  totalDays: number;
  publishedDays: number;
  leaveDays: number;
  waivedDays: number;
  absentDays: number;
  unconfirmedDays: number;
  consecutiveMissing: number;
  fulfillmentRate: number;
  days: Record<string, FulfillmentDayRecord>;
}

export interface FulfillmentCalendarData {
  year: number;
  month: number;
  range: FulfillmentDateRange;
  scope: FulfillmentScopeFilter;
  filterOptions: {
    teams: FulfillmentTeamOption[];
    groups: FulfillmentGroupOption[];
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
  };
}

export interface MarkFulfillmentInput {
  userId: string;
  recordDate: string;
  status: Exclude<FulfillmentStatus, "published" | "exempted" | "unconfirmed">;
  reason?: string;
}

// === 前端新增类型 ===

export type TimeRangePreset = "today" | "last7days" | "thisMonth" | "lastMonth" | "custom";

export interface FulfillmentFilters {
  preset: TimeRangePreset;
  fromDate?: string;
  toDate?: string;
  teamName?: string;
  groupName?: string;
}

/** 批量标记输入 */
export interface BatchMarkInput {
  items: MarkFulfillmentInput[];
}

/** 批量标记结果 */
export interface BatchMarkResult {
  success: { userId: string; recordDate: string }[];
  failed: { userId: string; recordDate: string; error: string }[];
}
