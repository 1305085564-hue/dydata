export type FulfillmentStatus =
  | "published"
  | "leave"
  | "waived"
  | "absent"
  | "confirmed_published"
  | "exempted"
  | "unconfirmed";

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
  publishedCount: number;
  consecutiveMissing: number;
}

export interface FulfillmentMemberSummary {
  userId: string;
  userName: string;
  teamName: string | null;
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
  members: FulfillmentMemberSummary[];
  todayExceptions: FulfillmentMemberSummary[];
  stats: {
    totalMembers: number;
    publishedToday: number;
    pendingToday: number;
    leaveToday: number;
    waivedToday: number;
    absentToday: number;
    monthlyFulfillmentRate: number;
  };
}

export interface MarkFulfillmentInput {
  userId: string;
  recordDate: string;
  status: Exclude<FulfillmentStatus, "published" | "exempted" | "unconfirmed">;
  reason?: string;
}
