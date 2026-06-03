"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  FulfillmentCalendarData,
  FulfillmentMemberSummary,
  FulfillmentStatus,
  TimeRangePreset,
} from "@/types/fulfillment";
import { FilterBar } from "./components/filter-bar";
import { StatsBar } from "./components/stats-bar";
import { ExceptionQueue } from "./components/exception-queue";
import { MonthlyMatrix } from "./components/monthly-matrix";
import { MemberDrawer } from "./components/member-drawer";

type Source = "queue" | "matrix";
type MarkAction = Extract<FulfillmentStatus, "leave" | "waived" | "absent" | "confirmed_published">;

interface FulfillmentWorkbenchProps {
  data: FulfillmentCalendarData;
  range: TimeRangePreset;
}

function formatTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function filterMembers(
  members: FulfillmentMemberSummary[],
  teamName: string | null,
  groupName: string | null,
  range: TimeRangePreset,
  today: string,
): FulfillmentMemberSummary[] {
  let filtered = members;

  if (teamName) {
    filtered = filtered.filter((m) => m.teamName === teamName);
  }
  if (groupName) {
    filtered = filtered.filter((m) => m.groupName === groupName);
  }

  switch (range) {
    case "today": {
      return filtered.filter((m) => m.days[today]);
    }
    case "last7days": {
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 6);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      return filtered.filter((m) => Object.keys(m.days).some((d) => d >= cutoffStr && d <= today));
    }
    default:
      return filtered;
  }
}

function sortExceptions(members: FulfillmentMemberSummary[], today: string): FulfillmentMemberSummary[] {
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

function calcStats(members: FulfillmentMemberSummary[], today: string) {
  const totalMembers = members.length;
  const publishedToday = members.filter((m) => {
    const s = m.days[today]?.status;
    return s === "published" || s === "confirmed_published";
  }).length;
  const pendingToday = members.filter((m) => m.days[today]?.status === "unconfirmed").length;
  const leaveToday = members.filter((m) => m.days[today]?.status === "leave").length;
  const waivedToday = members.filter((m) => {
    const s = m.days[today]?.status;
    return s === "waived" || s === "exempted";
  }).length;
  const absentToday = members.filter((m) => m.days[today]?.status === "absent").length;
  const totalDays = members.reduce((sum, m) => sum + m.totalDays, 0);
  const publishedDays = members.reduce((sum, m) => sum + m.publishedDays, 0);
  const periodFulfillmentRate = toPercent(publishedDays, totalDays);
  const consecutiveMissingMembers = members.filter((m) => m.consecutiveMissing > 0).length;

  return {
    totalMembers,
    publishedToday,
    pendingToday,
    leaveToday,
    waivedToday,
    absentToday,
    periodFulfillmentRate,
    consecutiveMissingMembers,
  };
}

export function FulfillmentWorkbench({ data, range }: FulfillmentWorkbenchProps) {
  const router = useRouter();
  const today = formatTodayDateOnly();

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<FulfillmentMemberSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("queue");

  const queueRef = useRef<FulfillmentMemberSummary[]>([]);
  const queueIndexRef = useRef<number>(-1);

  // 客户端过滤 + 排序
  const filteredMembers = useMemo(
    () => filterMembers(data.members, selectedTeam, selectedGroup, range, today),
    [data.members, selectedTeam, selectedGroup, range, today],
  );

  const exceptionMembers = useMemo(() => {
    // 异常队列：默认显示今天 unconfirmed 的人
    const exceptions = filteredMembers.filter((m) => m.days[today]?.status === "unconfirmed");
    return sortExceptions(exceptions, today);
  }, [filteredMembers, today]);

  const stats = useMemo(() => calcStats(filteredMembers, today), [filteredMembers, today]);

  // 矩阵成员：全部过滤后成员（用于月度矩阵显示）
  const matrixMembers = useMemo(() => {
    return filteredMembers;
  }, [filteredMembers]);

  const handleTeamChange = useCallback((team: string | null) => {
    setSelectedTeam(team);
    setSelectedIds(new Set());
  }, []);

  const handleGroupChange = useCallback((group: string | null) => {
    setSelectedGroup(group);
    setSelectedIds(new Set());
  }, []);

  const handleSelectToggle = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedIds(new Set(exceptionMembers.map((m) => m.userId)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [exceptionMembers],
  );

  const handleQueueMemberClick = useCallback(
    (member: FulfillmentMemberSummary) => {
      queueRef.current = exceptionMembers;
      queueIndexRef.current = exceptionMembers.findIndex((m) => m.userId === member.userId);
      setSelectedMember(member);
      setSelectedDate(today);
      setSource("queue");
      setSheetOpen(true);
    },
    [exceptionMembers, today],
  );

  const handleMatrixCellClick = useCallback((member: FulfillmentMemberSummary, date: string) => {
    setSelectedMember(member);
    setSelectedDate(date);
    setSource("matrix");
    setSheetOpen(true);
  }, []);

  const handleMonthChange = useCallback(
    (year: number, month: number) => {
      router.push(`/admin/fulfillment?year=${year}&month=${month}&range=${range}`);
    },
    [router, range],
  );

  const handleActionComplete = useCallback(() => {
    router.refresh();
    setSelectedIds(new Set());

    if (source === "queue") {
      const queue = queueRef.current;
      const nextIndex = queueIndexRef.current + 1;
      const nextMember = queue[nextIndex];

      if (nextMember) {
        queueIndexRef.current = nextIndex;
        setTimeout(() => {
          setSelectedMember(nextMember);
          setSelectedDate(today);
          setSource("queue");
          setSheetOpen(true);
        }, 200);
      }
    }
  }, [source, router, today]);

  const handleQuickMark = useCallback(
    async (userId: string, status: MarkAction) => {
      const res = await fetch("/api/admin/fulfillment/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          recordDate: today,
          status,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "标记失败" }));
        throw new Error(err.error || "标记失败");
      }
      router.refresh();
    },
    [router, today],
  );

  const handleBatchMark = useCallback(
    async (userIds: string[], status: MarkAction, reason: string) => {
      const res = await fetch("/api/admin/fulfillment/bulk-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds,
          recordDate: today,
          status,
          reason: reason || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "批量标记失败" }));
        throw new Error(err.error || "批量标记失败");
      }

      setSelectedIds(new Set());
      router.refresh();
    },
    [router, today],
  );

  return (
    <div className="space-y-6">
      {/* 筛选工具栏 */}
      <FilterBar
        year={data.year}
        month={data.month}
        range={range}
        members={data.members}
        selectedTeam={selectedTeam}
        selectedGroup={selectedGroup}
        onTeamChange={handleTeamChange}
        onGroupChange={handleGroupChange}
      />

      {/* 统计条 */}
      <StatsBar stats={stats} />

      {/* P0 — 异常处理队列 */}
      <section>
        <ExceptionQueue
          members={exceptionMembers}
          today={today}
          selectedIds={selectedIds}
          onSelectToggle={handleSelectToggle}
          onSelectAll={handleSelectAll}
          onQuickMark={handleQuickMark}
          onBatchMark={handleBatchMark}
          onMemberClick={handleQueueMemberClick}
        />
      </section>

      {/* P2 — 月度矩阵（可折叠） */}
      <section>
        <MonthlyMatrix
          year={data.year}
          month={data.month}
          members={matrixMembers}
          today={today}
          onCellClick={handleMatrixCellClick}
          onMonthChange={handleMonthChange}
        />
      </section>

      {/* P3 — 成员履约抽屉 */}
      <MemberDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        member={selectedMember}
        date={selectedDate}
        source={source}
        onActionComplete={handleActionComplete}
      />
    </div>
  );
}
