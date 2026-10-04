import type {
  FulfillmentMemberSummary,
  FulfillmentStatus,
  TimeRangePreset,
} from "@/types/fulfillment";
import {
  countsTowardFulfillmentRequirement,
  isFulfilledFulfillmentStatus,
  isWaivedFulfillmentStatus,
} from "@/lib/fulfillment-status";
import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";

export function formatTodayDateOnly() {
  return formatShanghaiDateOnly();
}

export function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function filterMembers(
  members: FulfillmentMemberSummary[],
  teamName: string | null,
  range: TimeRangePreset,
  today: string,
): FulfillmentMemberSummary[] {
  let filtered = members;

  if (teamName) {
    filtered = filtered.filter((m) => m.teamName === teamName);
  }

  switch (range) {
    case "today": {
      return filtered.filter((m) => m.days[today]);
    }
    case "last7days": {
      const cutoffStr = shiftDateOnly(new Date(`${today}T12:00:00+08:00`), -6);
      return filtered.filter((m) =>
        Object.keys(m.days).some((d) => d >= cutoffStr && d <= today),
      );
    }
    default:
      return filtered;
  }
}

export function sortExceptions(
  members: FulfillmentMemberSummary[],
  today: string,
): FulfillmentMemberSummary[] {
  return [...members].sort((a, b) => {
    // 1. 连续未发天数 desc
    if (b.consecutiveMissing !== a.consecutiveMissing) {
      return b.consecutiveMissing - a.consecutiveMissing;
    }
    // 2. 今日未处理优先
    const aUnconfirmed = a.days[today]?.status === "unconfirmed" ? 1 : 0;
    const bUnconfirmed = b.days[today]?.status === "unconfirmed" ? 1 : 0;
    if (bUnconfirmed !== aUnconfirmed) {
      return bUnconfirmed - aUnconfirmed;
    }
    // 3. 发布率 asc
    return a.fulfillmentRate - b.fulfillmentRate;
  });
}

export function formatDisplayDate(date: string, today: string) {
  if (date === today) return "今日";
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return `${m}月${d}日`;
}

export function updateMemberDayOptimistically(
  members: FulfillmentMemberSummary[],
  userId: string,
  date: string,
  status: FulfillmentStatus,
  reason = "",
): FulfillmentMemberSummary[] {
  return members.map((m) => {
    if (m.userId !== userId) return m;
    const originalRecord = m.days[date];
    const newRecord = {
      ...originalRecord,
      userId,
      userName: m.userName,
      teamId: m.teamId,
      teamName: m.teamName,
      date,
      status,
      reason,
      markedByName: "您",
      publishedCount: originalRecord?.publishedCount || 0,
      consecutiveMissing: 0,
    };
    const nextDays = { ...m.days, [date]: newRecord };

    let publishedDays = 0;
    let leaveDays = 0;
    let waivedDays = 0;
    let absentDays = 0;
    let publishedCount = 0;
    let requiredCount = 0;
    Object.values(nextDays).forEach((d) => {
      publishedCount += d.publishedCount;
      if (isFulfilledFulfillmentStatus(d.status)) publishedDays++;
      else if (d.status === "leave") leaveDays++;
      else if (isWaivedFulfillmentStatus(d.status)) waivedDays++;
      else if (d.status === "absent") absentDays++;
      if (countsTowardFulfillmentRequirement(d.status)) {
        requiredCount++;
      }
    });

    return {
      ...m,
      consecutiveMissing: 0,
      publishedDays,
      leaveDays,
      waivedDays,
      absentDays,
      publishedCount,
      requiredCount,
      remainingCount: Math.max(0, requiredCount - publishedCount),
      fulfillmentRate:
        requiredCount > 0
          ? Math.round((publishedCount / requiredCount) * 100)
          : 0,
      days: nextDays,
    };
  });
}

export function calcStats(members: FulfillmentMemberSummary[], today: string) {
  const totalMembers = members.length;
  const publishedToday = members.filter((m) => {
    const s = m.days[today]?.status;
    return isFulfilledFulfillmentStatus(s);
  }).length;
  const pendingToday = members.filter(
    (m) => m.days[today]?.status === "unconfirmed",
  ).length;
  const leaveToday = members.filter(
    (m) => m.days[today]?.status === "leave",
  ).length;
  const waivedToday = members.filter((m) => {
    const s = m.days[today]?.status;
    return isWaivedFulfillmentStatus(s);
  }).length;
  const absentToday = members.filter(
    (m) => m.days[today]?.status === "absent",
  ).length;
  const consecutiveMissingMembers = members.filter(
    (m) => m.consecutiveMissing > 0,
  ).length;
  const publishedCount = members.reduce((sum, member) => sum + member.publishedCount, 0);
  const requiredCount = members.reduce((sum, member) => sum + member.requiredCount, 0);
  const periodFulfillmentRate = toPercent(publishedCount, requiredCount);
  const pendingRequestIds = new Set(
    members.flatMap((member) =>
      Object.values(member.days)
        .map((day) => day.pendingExemption?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  return {
    totalMembers,
    publishedToday,
    pendingToday,
    leaveToday,
    waivedToday,
    absentToday,
    periodFulfillmentRate,
    consecutiveMissingMembers,
    publishedCount,
    requiredCount,
    pendingExemptionRequests: pendingRequestIds.size,
  };
}
