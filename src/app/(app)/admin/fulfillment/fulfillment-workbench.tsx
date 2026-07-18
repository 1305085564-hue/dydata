"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { trackUsageEvent } from "@/lib/usage-events/client";

type Source = "queue" | "matrix";
type MarkAction = Extract<FulfillmentStatus, "leave" | "waived" | "absent" | "confirmed_published">;
type FulfillmentRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchFulfillmentAppeals(request: FulfillmentRequest = fetch): Promise<any[]> {
  const response = await request("/api/admin/fulfillment/appeals?limit=150");
  const payload = (await response.json()) as { appeals?: any[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "申诉加载失败");
  }
  return Array.isArray(payload.appeals) ? payload.appeals : [];
}

export async function fetchFulfillmentSettings(request: FulfillmentRequest = fetch): Promise<boolean> {
  const response = await request("/api/admin/system/settings");
  const payload = (await response.json()) as {
    feishuFulfillmentReminderEnabled?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "设置读取失败");
  }
  if (typeof payload.feishuFulfillmentReminderEnabled !== "boolean") {
    throw new Error("设置数据格式无效");
  }
  return payload.feishuFulfillmentReminderEnabled;
}

interface FulfillmentWorkbenchProps {
  initialData: FulfillmentCalendarData;
  initialRange: TimeRangePreset;
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

export function FulfillmentWorkbench({ initialData, initialRange }: FulfillmentWorkbenchProps) {
  const today = formatTodayDateOnly();

  // 1. 核心状态：日历数据与范围
  const [calendarData, setCalendarData] = useState<FulfillmentCalendarData>(initialData);
  const [range, setRange] = useState<TimeRangePreset>(initialRange);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // 2. 飞书自动催交总开关状态
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // 3. 申诉状态
  const [appeals, setAppeals] = useState<any[]>([]);
  const [appealsLoading, setAppealsLoading] = useState(true);
  const [appealsError, setAppealsError] = useState<string | null>(null);
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

  // 4. 选择与抽屉状态
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<FulfillmentMemberSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("queue");

  const queueRef = useRef<FulfillmentMemberSummary[]>([]);
  const queueIndexRef = useRef<number>(-1);

  // 5. 初始化配置加载与申诉加载
  const fetchAppeals = useCallback(async () => {
    setAppealsLoading(true);
    setAppealsError(null);
    try {
      setAppeals(await fetchFulfillmentAppeals());
    } catch (err) {
      console.error("加载申诉失败", err);
      setAppeals([]);
      setAppealsError(err instanceof Error ? err.message : "申诉加载失败");
    } finally {
      setAppealsLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      setFeishuEnabled(await fetchFulfillmentSettings());
    } catch (err) {
      console.error("加载飞书设置失败", err);
      setSettingsError(err instanceof Error ? err.message : "设置读取失败");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void fetchAppeals();
  }, [fetchAppeals, loadSettings]);

  // 6. 飞书总开关变更处理
  const handleFeishuChange = async (checked: boolean) => {
    setIsUpdatingSettings(true);
    // 乐观更新
    setFeishuEnabled(checked);
    try {
      const res = await fetch("/api/admin/system/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feishuFulfillmentReminderEnabled: checked }),
      });
      if (!res.ok) {
        throw new Error("更新失败");
      }
      toast.success(checked ? "已开启飞书自动催交" : "已关闭飞书自动催交");
    } catch {
      toast.error("更新飞书催交配置失败，已回滚");
      setFeishuEnabled(!checked);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // 7. 处理申诉审批动作
  const handleHandleAppeal = async (appealId: string, decision: "approve" | "reject") => {
    setIsSubmittingAppeal(true);
    try {
      const res = await fetch("/api/admin/fulfillment/appeal/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId, decision }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "操作失败" }));
        toast.error(err.error || "操作失败");
        return;
      }
      toast.success(decision === "approve" ? "已同意申诉并改判" : "已驳回申诉");
      
      // 静默重新加载日历和申诉
      await fetchAppeals();
      const calendarRes = await fetch(`/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`);
      if (calendarRes.ok) {
        const refreshResult = await calendarRes.json();
        setCalendarData(refreshResult.data);
      }
    } catch {
      toast.error("处理申诉发生网络错误");
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  // 8. 客户端无感日历加载器
  const loadCalendar = useCallback(async (targetYear: number, targetMonth: number, targetRange: TimeRangePreset) => {
    setIsLoadingCalendar(true);
    try {
      const res = await fetch(`/api/admin/fulfillment/calendar?year=${targetYear}&month=${targetMonth}`);
      if (!res.ok) throw new Error("加载数据失败");
      const result = await res.json();
      setCalendarData(result.data);

      // 同步 URL 参数
      const url = new URL(window.location.href);
      url.searchParams.set("year", String(targetYear));
      url.searchParams.set("month", String(targetMonth));
      url.searchParams.set("range", targetRange);
      window.history.pushState(null, "", url.pathname + url.search);
    } catch {
      toast.error("加载履约日历失败，请重试");
    } finally {
      setIsLoadingCalendar(false);
    }
  }, []);

  const handlePresetChange = useCallback(
    (targetPreset: TimeRangePreset, targetYear: number, targetMonth: number) => {
      setRange(targetPreset);
      loadCalendar(targetYear, targetMonth, targetPreset);
    },
    [loadCalendar]
  );

  const handleMonthChange = useCallback(
    (targetYear: number, targetMonth: number) => {
      loadCalendar(targetYear, targetMonth, range);
    },
    [loadCalendar, range]
  );

  // 9. 客户端过滤与统计
  const filteredMembers = useMemo(
    () => filterMembers(calendarData.members, selectedTeam, selectedGroup, range, today),
    [calendarData.members, selectedTeam, selectedGroup, range, today],
  );

  const exceptionMembers = useMemo(() => {
    // 异常队列：待处理 unconfirmed 成员
    const exceptions = filteredMembers.filter((m) => m.days[today]?.status === "unconfirmed");
    return sortExceptions(exceptions, today);
  }, [filteredMembers, today]);

  const pendingAppeals = useMemo(() => {
    if (!Array.isArray(appeals)) return [];
    // 过滤出当前管理范围内的 pending 申诉
    const visibleUserSet = new Set(calendarData.members.map((m) => m.userId));
    return appeals.filter((a) => a.status === "pending" && visibleUserSet.has(a.user_id));
  }, [appeals, calendarData.members]);

  const stats = useMemo(() => calcStats(filteredMembers, today), [filteredMembers, today]);

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

  // 10. 操作回调
  const handleActionComplete = useCallback(() => {
    setSelectedIds(new Set());

    // 重新拉取最新的日历和申诉
    fetchAppeals();
    fetch(`/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`)
      .then(async (res) => {
        if (res.ok) {
          const r = await res.json();
          setCalendarData(r.data);
        }
      });

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
  }, [source, today, calendarData.year, calendarData.month, fetchAppeals]);

  // 11. 快速与批量打标的乐观更新机制
  const handleQuickMark = useCallback(
    async (userId: string, status: MarkAction) => {
      const originalMembers = calendarData.members;

      // 乐观更新状态
      setCalendarData((prev) => {
        const nextMembers = prev.members.map((m) => {
          if (m.userId !== userId) return m;
          const originalRecord = m.days[today];
          const newRecord = {
            ...originalRecord,
            userId,
            userName: m.userName,
            teamId: m.teamId,
            teamName: m.teamName,
            groupId: m.groupId,
            groupName: m.groupName,
            date: today,
            status,
            reason: "",
            markedByName: "您",
            publishedCount: originalRecord?.publishedCount || 0,
            consecutiveMissing: 0,
          };
          const nextDays = { ...m.days, [today]: newRecord };
          
          let publishedDays = 0;
          let leaveDays = 0;
          let waivedDays = 0;
          let absentDays = 0;
          Object.values(nextDays).forEach((d) => {
            if (d.status === "published" || d.status === "confirmed_published") publishedDays++;
            else if (d.status === "leave") leaveDays++;
            else if (d.status === "waived" || d.status === "exempted") waivedDays++;
            else if (d.status === "absent") absentDays++;
          });
          
          return {
            ...m,
            consecutiveMissing: 0,
            publishedDays,
            leaveDays,
            waivedDays,
            absentDays,
            fulfillmentRate: m.totalDays > 0 ? Math.round((publishedDays / m.totalDays) * 100) : 0,
            days: nextDays,
          };
        });
        return { ...prev, members: nextMembers };
      });

      // 静默发包
      try {
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
        trackUsageEvent({ path: "/admin/fulfillment", eventType: "mark_fulfillment_status" });
        toast.success("标记成功");
        
        // 后台静默刷新以同步统计大盘
        const refreshRes = await fetch(`/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`);
        if (refreshRes.ok) {
          const refreshResult = await refreshRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err: any) {
        toast.error(err.message || "标记失败，已回滚");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, calendarData.year, calendarData.month, today]
  );

  const handleBatchMark = useCallback(
    async (userIds: string[], status: MarkAction, reason: string) => {
      const originalMembers = calendarData.members;

      // 乐观更新状态
      setCalendarData((prev) => {
        const nextMembers = prev.members.map((m) => {
          if (!userIds.includes(m.userId)) return m;
          const originalRecord = m.days[today];
          const newRecord = {
            ...originalRecord,
            userId: m.userId,
            userName: m.userName,
            teamId: m.teamId,
            teamName: m.teamName,
            groupId: m.groupId,
            groupName: m.groupName,
            date: today,
            status,
            reason,
            markedByName: "您",
            publishedCount: originalRecord?.publishedCount || 0,
            consecutiveMissing: 0,
          };
          const nextDays = { ...m.days, [today]: newRecord };

          let publishedDays = 0;
          let leaveDays = 0;
          let waivedDays = 0;
          let absentDays = 0;
          Object.values(nextDays).forEach((d) => {
            if (d.status === "published" || d.status === "confirmed_published") publishedDays++;
            else if (d.status === "leave") leaveDays++;
            else if (d.status === "waived" || d.status === "exempted") waivedDays++;
            else if (d.status === "absent") absentDays++;
          });

          return {
            ...m,
            consecutiveMissing: 0,
            publishedDays,
            leaveDays,
            waivedDays,
            absentDays,
            fulfillmentRate: m.totalDays > 0 ? Math.round((publishedDays / m.totalDays) * 100) : 0,
            days: nextDays,
          };
        });
        return { ...prev, members: nextMembers };
      });

      setSelectedIds(new Set());

      // 静默发包
      try {
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
        trackUsageEvent({ path: "/admin/fulfillment", eventType: "mark_fulfillment_status" });
        toast.success("批量标记成功");

        // 后台静默刷新以同步统计大盘
        const refreshRes = await fetch(`/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`);
        if (refreshRes.ok) {
          const refreshResult = await refreshRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err: any) {
        toast.error(err.message || "批量标记失败，已回滚");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, calendarData.year, calendarData.month, today]
  );

  return (
    <div className="space-y-6">
      {/* 筛选工具栏 */}
      <FilterBar
        year={calendarData.year}
        month={calendarData.month}
        range={range}
        members={calendarData.members}
        selectedTeam={selectedTeam}
        selectedGroup={selectedGroup}
        onTeamChange={handleTeamChange}
        onGroupChange={handleGroupChange}
        onPresetChange={handlePresetChange}
        feishuEnabled={feishuEnabled}
        settingsLoading={settingsLoading}
        settingsError={settingsError}
        isUpdatingSettings={isUpdatingSettings}
        onRetrySettings={() => void loadSettings()}
        onFeishuChange={handleFeishuChange}
      />

      {/* 统计条 */}
      <StatsBar stats={stats} />

      {/* P0 — 待处理工作流 (Tab 整合：异常处理队列 与 待处理申诉列表) */}
      <section className="space-y-3">
        <Tabs defaultValue="exceptions" className="w-full">
          <div className="flex items-center justify-between border-b border-stone-200/50 pb-2">
            <TabsList variant="line">
              <TabsTrigger value="exceptions" className="text-[12px]">
                待处理异常
                <span className="ml-1.5 text-[12px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700">
                  {exceptionMembers.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="appeals" className="text-[12px]">
                待审核申诉
                {appealsError ? (
                  <span className="ml-1.5 rounded border border-[#C9604D]/20 bg-[#C9604D]/5 px-1.5 py-0.5 text-[#C9604D]">!</span>
                ) : pendingAppeals.length > 0 ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[12px] px-1.5 py-0.5 rounded border border-[#D99E55]/15 bg-[#D99E55]/[0.04] text-[#8F641B] font-medium">
                    <span className="size-1 rounded-full bg-[#D99E55]" />
                    {pendingAppeals.length}
                  </span>
                ) : (
                  <span className="ml-1.5 text-[12px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700">
                    0
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="exceptions" className="mt-3">
            {isLoadingCalendar ? (
              <div className="flex items-center justify-center py-12 rounded-2xl border border-stone-200 bg-white">
                <span className="size-6 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2" />
                <span className="text-[13px] text-stone-500">正在刷新数据...</span>
              </div>
            ) : (
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
            )}
          </TabsContent>

          <TabsContent value="appeals" className="mt-3">
            {appealsError ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
                <p className="text-[13px] font-medium text-stone-800">申诉数据加载失败</p>
                <p className="mt-1 text-[12px] text-stone-500">{appealsError}</p>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void fetchAppeals()}>
                  重新加载
                </Button>
              </div>
            ) : appealsLoading || isSubmittingAppeal ? (
              <div className="flex items-center justify-center py-12 rounded-2xl border border-stone-200 bg-white">
                <span className="size-6 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2" />
                <span className="text-[13px] text-stone-500">{isSubmittingAppeal ? "正在处理申诉..." : "正在加载申诉..."}</span>
              </div>
            ) : pendingAppeals.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white py-12">
                <EmptyState title="当前无待处理申诉" description="所有成员的申诉请求已处理完毕" />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-stone-200/50 bg-stone-50/50">
                        <th className="px-3 py-2.5 text-left text-[12px] font-normal tracking-[0.12em] text-stone-500">成员</th>
                        <th className="px-3 py-2.5 text-left text-[12px] font-normal tracking-[0.12em] text-stone-500">申诉日期</th>
                        <th className="px-3 py-2.5 text-left text-[12px] font-normal tracking-[0.12em] text-stone-500">申诉原因</th>
                        <th className="px-3 py-2.5 text-left text-[12px] font-normal tracking-[0.12em] text-stone-500">提交时间</th>
                        <th className="px-3 py-2.5 text-right text-[12px] font-normal tracking-[0.12em] text-stone-500">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingAppeals.map((appeal) => (
                        <tr key={appeal.id} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/30 transition-colors">
                          <td className="px-3 py-2.5 font-medium text-stone-900">{appeal.user_name || "未知成员"}</td>
                          <td className="px-3 py-2.5 text-[12px] tabular-nums text-stone-700">{appeal.record_date}</td>
                          <td className="max-w-[240px] truncate px-3 py-2.5 text-stone-700" title={appeal.reason}>
                            {appeal.reason}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] tabular-nums text-stone-500">
                            {new Date(appeal.created_at).toLocaleString("zh-CN")}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-[#3F7A4E] border-[#6FAA7D]/30 hover:bg-[#6FAA7D]/5 hover:text-[#3F7A4E] font-medium"
                                onClick={() => handleHandleAppeal(appeal.id, "approve")}
                              >
                                同意并改判
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-[#B24E3E] border-[#C9604D]/30 hover:bg-[#C9604D]/5 hover:text-[#B24E3E] font-medium"
                                onClick={() => handleHandleAppeal(appeal.id, "reject")}
                              >
                                驳回
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {/* P2 — 月度矩阵（可折叠） */}
      <section>
        {isLoadingCalendar ? (
          <div className="flex flex-col gap-3">
            <button disabled className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left">
              <span className="text-[13px] font-normal text-stone-500">正在刷新日历数据...</span>
              <span className="size-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
            </button>
          </div>
        ) : (
          <MonthlyMatrix
            year={calendarData.year}
            month={calendarData.month}
            members={filteredMembers}
            today={today}
            onCellClick={handleMatrixCellClick}
            onMonthChange={handleMonthChange}
            appeals={appeals}
          />
        )}
      </section>

      {/* P3 — 成员履约抽屉 */}
      <MemberDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        member={selectedMember}
        date={selectedDate}
        source={source}
        onActionComplete={handleActionComplete}
        appeals={appeals}
      />
    </div>
  );
}
