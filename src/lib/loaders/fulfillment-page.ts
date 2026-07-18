import { createAdminClient } from "@/lib/supabase/admin";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import type {
  FulfillmentCalendarData,
  FulfillmentDayRecord,
  FulfillmentDateRange,
  FulfillmentGroupOption,
  FulfillmentMemberSummary,
  FulfillmentScopeFilter,
  FulfillmentStatus,
  FulfillmentTeamOption,
} from "@/types/fulfillment";

export type FulfillmentCalendarRpcRow = {
  user_id: string;
  user_name: string;
  team_id: string | null;
  team_name: string | null;
  group_id: string | null;
  group_name: string | null;
  record_date: string;
  status: FulfillmentStatus;
  reason: string | null;
  marked_at?: string | null;
  marked_by_name: string | null;
  published_count: number | null;
  consecutive_missing: number | null;
};

type BuildFulfillmentCalendarInput = {
  year: number;
  month: number;
  range?: FulfillmentDateRange;
  scope?: FulfillmentScopeFilter;
  filterOptions?: FulfillmentCalendarData["filterOptions"];
  rows: FulfillmentCalendarRpcRow[];
  today?: string;
};

export type LoadFulfillmentCalendarOptions = {
  year?: number;
  month?: number;
  range?: Partial<FulfillmentDateRange>;
  visibleUserIds?: string[];
  teamId?: string | null;
  groupId?: string | null;
};

const FULFILLED_STATUSES = new Set<FulfillmentStatus>(["published", "confirmed_published"]);
const WAIVED_STATUSES = new Set<FulfillmentStatus>(["waived", "exempted"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveFulfillmentTodayKey(date: Date = new Date()) {
  return formatShanghaiDateOnly(date);
}

function parseDateKey(value: string | null | undefined) {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getMonthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

function clampRangeEnd(end: Date, today: Date) {
  return end > today ? today : end;
}

function getRangeLabel(range: Pick<FulfillmentDateRange, "preset" | "startDate" | "endDate">) {
  if (range.preset === "today") return "今天";
  if (range.preset === "last7") return "最近 7 天";
  if (range.preset === "this_month") return "本月";
  if (range.preset === "last_month") return "上月";
  if (range.startDate === range.endDate) return range.startDate;
  return `${range.startDate} 至 ${range.endDate}`;
}

export function resolveFulfillmentDateRange(
  input: {
    preset?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    year?: number | null;
    month?: number | null;
  } = {},
  todayKey = resolveFulfillmentTodayKey(),
): FulfillmentDateRange {
  const today = parseDateKey(todayKey) ?? new Date();
  const customStart = parseDateKey(input.startDate);
  const customEnd = parseDateKey(input.endDate);

  let preset = input.preset;
  let start: Date;
  let end: Date;

  if (customStart && customEnd && customStart <= customEnd) {
    preset = "custom";
    start = customStart;
    end = customEnd;
  } else if (preset === "today") {
    start = today;
    end = today;
  } else if (preset === "last7") {
    start = addDays(today, -6);
    end = today;
  } else if (preset === "last_month") {
    const bounds = getMonthBounds(today.getUTCFullYear(), today.getUTCMonth());
    start = bounds.start;
    end = bounds.end;
  } else if (preset === "this_month") {
    const bounds = getMonthBounds(today.getUTCFullYear(), today.getUTCMonth() + 1);
    start = bounds.start;
    end = today;
  } else {
    const year = Number.isFinite(input.year) && input.year ? input.year : today.getUTCFullYear();
    const month = Number.isFinite(input.month) && input.month ? input.month : today.getUTCMonth() + 1;
    const bounds = getMonthBounds(year as number, Math.min(Math.max(month as number, 1), 12));
    preset = "month";
    start = bounds.start;
    end = bounds.end;
  }

  end = clampRangeEnd(end, today);
  if (start > end) start = end;

  const normalized = {
    preset: (preset === "today" || preset === "last7" || preset === "this_month" || preset === "last_month" || preset === "custom"
      ? preset
      : "month") as FulfillmentDateRange["preset"],
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
  };

  return {
    ...normalized,
    label: getRangeLabel(normalized),
  };
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function incrementMemberSummary(summary: FulfillmentMemberSummary, day: FulfillmentDayRecord) {
  summary.totalDays += 1;
  summary.consecutiveMissing = Math.max(summary.consecutiveMissing, day.consecutiveMissing);
  summary.days[day.date] = day;

  if (FULFILLED_STATUSES.has(day.status)) {
    summary.publishedDays += 1;
  } else if (day.status === "leave") {
    summary.leaveDays += 1;
  } else if (WAIVED_STATUSES.has(day.status)) {
    summary.waivedDays += 1;
  } else if (day.status === "absent") {
    summary.absentDays += 1;
  } else if (day.status === "unconfirmed") {
    summary.unconfirmedDays += 1;
  }
}

function createMemberSummary(row: FulfillmentCalendarRpcRow): FulfillmentMemberSummary {
  return {
    userId: row.user_id,
    userName: row.user_name,
    teamId: row.team_id,
    teamName: row.team_name,
    groupId: row.group_id,
    groupName: row.group_name,
    totalDays: 0,
    publishedDays: 0,
    leaveDays: 0,
    waivedDays: 0,
    absentDays: 0,
    unconfirmedDays: 0,
    consecutiveMissing: 0,
    fulfillmentRate: 0,
    days: {},
  };
}

function toDayRecord(row: FulfillmentCalendarRpcRow): FulfillmentDayRecord {
  return {
    userId: row.user_id,
    userName: row.user_name,
    teamId: row.team_id,
    teamName: row.team_name,
    groupId: row.group_id,
    groupName: row.group_name,
    date: row.record_date,
    status: row.status,
    reason: row.reason ?? "",
    markedAt: row.marked_at ?? "",
    markedByName: row.marked_by_name ?? "",
    publishedCount: row.published_count ?? 0,
    consecutiveMissing: row.consecutive_missing ?? 0,
  };
}

function sortExceptionMembers(members: FulfillmentMemberSummary[]) {
  return [...members].sort((left, right) => {
    if (right.consecutiveMissing !== left.consecutiveMissing) {
      return right.consecutiveMissing - left.consecutiveMissing;
    }
    if (right.unconfirmedDays !== left.unconfirmedDays) {
      return right.unconfirmedDays - left.unconfirmedDays;
    }
    return left.fulfillmentRate - right.fulfillmentRate;
  });
}

export function buildFulfillmentCalendarData({
  year,
  month,
  range,
  scope,
  filterOptions,
  rows,
  today = resolveFulfillmentTodayKey(),
}: BuildFulfillmentCalendarInput): FulfillmentCalendarData {
  const memberMap = new Map<string, FulfillmentMemberSummary>();

  for (const row of rows) {
    const summary = memberMap.get(row.user_id) ?? createMemberSummary(row);
    incrementMemberSummary(summary, toDayRecord(row));
    memberMap.set(row.user_id, summary);
  }

  const members = Array.from(memberMap.values()).map((member) => ({
    ...member,
    fulfillmentRate: toPercent(member.publishedDays, member.totalDays),
  }));
  const todayRows = rows.filter((row) => row.record_date === today);
  const publishedDays = members.reduce((total, member) => total + member.publishedDays, 0);
  const totalDays = members.reduce((total, member) => total + member.totalDays, 0);
  const normalizedRange = range ?? resolveFulfillmentDateRange({ year, month }, today);

  return {
    year,
    month,
    range: normalizedRange,
    scope: scope ?? { teamId: null, groupId: null, label: "全部可见范围" },
    filterOptions: filterOptions ?? { teams: [], groups: [] },
    members,
    todayExceptions: sortExceptionMembers(members
      .filter((member) => member.days[today]?.status === "unconfirmed")
    ),
    rangeExceptions: sortExceptionMembers(members.filter((member) => member.unconfirmedDays > 0)),
    stats: {
      totalMembers: members.length,
      publishedToday: todayRows.filter((row) => FULFILLED_STATUSES.has(row.status)).length,
      pendingToday: todayRows.filter((row) => row.status === "unconfirmed").length,
      leaveToday: todayRows.filter((row) => row.status === "leave").length,
      waivedToday: todayRows.filter((row) => WAIVED_STATUSES.has(row.status)).length,
      absentToday: todayRows.filter((row) => row.status === "absent").length,
      consecutiveMissingMembers: members.filter((member) => member.consecutiveMissing > 0).length,
      periodFulfillmentRate: toPercent(publishedDays, totalDays),
    },
  };
}

function normalizeUuid(value: string | null | undefined) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

async function loadFulfillmentFilterOptions(
  supabase: ReturnType<typeof createAdminClient>,
  visibleUserIds: string[],
): Promise<FulfillmentCalendarData["filterOptions"]> {
  if (visibleUserIds.length === 0) return { teams: [], groups: [] };

  const { data: profileRows, error } = await supabase
    .from("profiles")
    .select("team_id, group_id")
    .in("id", visibleUserIds);

  if (error) {
    throw new Error(error.message || "加载发布管理筛选项失败");
  }

  const teamIds = Array.from(new Set((profileRows ?? []).map((row) => row.team_id).filter(Boolean))) as string[];
  const groupIds = Array.from(new Set((profileRows ?? []).map((row) => row.group_id).filter(Boolean))) as string[];

  const [teamsResult, groupsResult] = await Promise.all([
    teamIds.length > 0
      ? supabase.from("teams").select("id, name").in("id", teamIds).order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? supabase.from("groups").select("id, name, team_id").in("id", groupIds).order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (teamsResult.error) throw new Error(teamsResult.error.message || "加载团队筛选项失败");
  if (groupsResult.error) throw new Error(groupsResult.error.message || "加载小组筛选项失败");

  return {
    teams: (teamsResult.data ?? []) as FulfillmentTeamOption[],
    groups: (groupsResult.data ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      teamId: group.team_id ?? null,
    })) as FulfillmentGroupOption[],
  };
}

function resolveScopeFilter(
  teamId: string | null,
  groupId: string | null,
  filterOptions: FulfillmentCalendarData["filterOptions"],
): FulfillmentScopeFilter {
  if (groupId) {
    const group = filterOptions.groups.find((item) => item.id === groupId);
    return {
      teamId: group?.teamId ?? teamId,
      groupId,
      label: group ? `小组：${group.name}` : "指定小组",
    };
  }

  if (teamId) {
    const team = filterOptions.teams.find((item) => item.id === teamId);
    return {
      teamId,
      groupId: null,
      label: team ? `团队：${team.name}` : "指定团队",
    };
  }

  return { teamId: null, groupId: null, label: "全部可见范围" };
}

function normalizeLoadOptions(
  input: number | LoadFulfillmentCalendarOptions,
  month?: number,
  visibleUserIds: string[] = [],
): Required<Pick<LoadFulfillmentCalendarOptions, "visibleUserIds">> & Omit<LoadFulfillmentCalendarOptions, "visibleUserIds"> {
  if (typeof input === "number") {
    return { year: input, month, visibleUserIds, teamId: null, groupId: null };
  }

  return {
    ...input,
    visibleUserIds: input.visibleUserIds ?? [],
    teamId: input.teamId ?? null,
    groupId: input.groupId ?? null,
  };
}

export async function loadFulfillmentCalendar(
  year: number,
  month: number,
  visibleUserIds?: string[],
): Promise<FulfillmentCalendarData>;
export async function loadFulfillmentCalendar(options: LoadFulfillmentCalendarOptions): Promise<FulfillmentCalendarData>;
export async function loadFulfillmentCalendar(
  input: number | LoadFulfillmentCalendarOptions,
  month?: number,
  visibleUserIds: string[] = [],
): Promise<FulfillmentCalendarData> {
  const options = normalizeLoadOptions(input, month, visibleUserIds);
  const supabase = createAdminClient();
  const range = options.range?.startDate && options.range?.endDate
    ? resolveFulfillmentDateRange({
        preset: options.range.preset ?? "custom",
        startDate: options.range.startDate,
        endDate: options.range.endDate,
      })
    : resolveFulfillmentDateRange({ year: options.year ?? null, month: options.month ?? null });
  const filterOptions = await loadFulfillmentFilterOptions(supabase, options.visibleUserIds);
  const teamId = normalizeUuid(options.teamId);
  const groupId = normalizeUuid(options.groupId);
  const scope = resolveScopeFilter(teamId, groupId, filterOptions);
  const { data, error } = await supabase.rpc("get_fulfillment_range", {
    p_start_date: range.startDate,
    p_end_date: range.endDate,
    p_visible_user_ids: options.visibleUserIds.length > 0 ? options.visibleUserIds : null,
    p_team_id: teamId,
    p_group_id: groupId,
  });

  if (error) {
    throw new Error(error.message || "加载发布管理日历失败");
  }

  return buildFulfillmentCalendarData({
    year: options.year ?? Number(range.startDate.slice(0, 4)),
    month: options.month ?? Number(range.startDate.slice(5, 7)),
    range,
    scope,
    filterOptions,
    rows: (data ?? []) as FulfillmentCalendarRpcRow[],
  });
}
