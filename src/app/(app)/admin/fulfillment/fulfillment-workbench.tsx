"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import type {
  FulfillmentAppeal,
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
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  dispatchFulfillmentDataChanged,
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";

type Source = "queue" | "matrix";
type MarkAction = Extract<
  FulfillmentStatus,
  "leave" | "waived" | "absent" | "confirmed_published"
>;
type FulfillmentRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchFulfillmentAppeals(
  request: FulfillmentRequest = fetch,
): Promise<FulfillmentAppeal[]> {
  const response = await request("/api/admin/fulfillment/appeals?limit=150");
  const payload = (await response.json()) as {
    appeals?: FulfillmentAppeal[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "申诉加载失败");
  }
  return Array.isArray(payload.appeals) ? payload.appeals : [];
}

export async function fetchFulfillmentSettings(
  request: FulfillmentRequest = fetch,
): Promise<boolean> {
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
  initialView?: "todo" | "matrix";
  currentUserId?: string;
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
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 6);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      return filtered.filter((m) =>
        Object.keys(m.days).some((d) => d >= cutoffStr && d <= today),
      );
    }
    default:
      return filtered;
  }
}

function sortExceptions(
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

function calcStats(members: FulfillmentMemberSummary[], today: string) {
  const totalMembers = members.length;
  const publishedToday = members.filter((m) => {
    const s = m.days[today]?.status;
    return s === "published" || s === "confirmed_published";
  }).length;
  const pendingToday = members.filter(
    (m) => m.days[today]?.status === "unconfirmed",
  ).length;
  const leaveToday = members.filter(
    (m) => m.days[today]?.status === "leave",
  ).length;
  const waivedToday = members.filter((m) => {
    const s = m.days[today]?.status;
    return s === "waived" || s === "exempted";
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

export function FulfillmentWorkbench({
  initialData,
  initialRange,
  initialView = "todo",
  currentUserId,
}: FulfillmentWorkbenchProps) {
  const today = formatTodayDateOnly();

  // 顶层视图切换状态：今日待办与异常 ↔ 月度全景矩阵
  const [mainView, setMainView] = useState<"todo" | "matrix">(initialView);

  // 默认定位到当前登录用户所属的团队，若无则定位到首个有团队名的团队
  const defaultTeam = useMemo(() => {
    if (currentUserId) {
      const userMember = initialData.members.find(
        (m) => m.userId === currentUserId,
      );
      if (userMember?.teamName) return userMember.teamName;
    }
    return initialData.members.find((m) => m.teamName)?.teamName ?? null;
  }, [currentUserId, initialData.members]);

  // 1. 核心状态：日历数据与范围
  const [calendarData, setCalendarData] =
    useState<FulfillmentCalendarData>(initialData);
  const [range, setRange] = useState<TimeRangePreset>(initialRange);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // 2. 飞书自动催交总开关状态
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // 3. 申诉状态
  const [appeals, setAppeals] = useState<FulfillmentAppeal[]>([]);
  const [appealsLoading, setAppealsLoading] = useState(true);
  const [appealsError, setAppealsError] = useState<string | null>(null);
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

  // 4. 选择与抽屉状态
  const [selectedTeam, setSelectedTeam] = useState<string | null>(defaultTeam);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<FulfillmentMemberSummary | null>(null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏加载履约设置与申诉列表（请求生命周期状态）
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
    } catch {
      toast.error("更新飞书催交配置失败，已回滚");
      setFeishuEnabled(!checked);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // 7. 处理申诉审批动作
  const handleHandleAppeal = async (
    appealId: string,
    decision: "approve" | "reject",
  ) => {
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

      // 静默重新加载日历和申诉
      await fetchAppeals();
      const calendarRes = await fetch(
        `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
      );
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
  const handleViewChange = useCallback((newView: "todo" | "matrix") => {
    setMainView(newView);
    const url = new URL(window.location.href);
    if (newView === "matrix") {
      url.searchParams.set("view", "matrix");
    } else {
      url.searchParams.delete("view");
    }
    window.history.pushState(null, "", url.pathname + url.search);
  }, []);

  const loadCalendar = useCallback(
    async (
      targetYear: number,
      targetMonth: number,
      targetRange: TimeRangePreset,
    ) => {
      setIsLoadingCalendar(true);
      try {
        const res = await fetch(
          `/api/admin/fulfillment/calendar?year=${targetYear}&month=${targetMonth}`,
        );
        if (!res.ok) throw new Error("加载数据失败");
        const result = await res.json();
        setCalendarData(result.data);

        // 同步 URL 参数
        const url = new URL(window.location.href);
        url.searchParams.set("year", String(targetYear));
        url.searchParams.set("month", String(targetMonth));
        url.searchParams.set("range", targetRange);
        if (mainView === "matrix") {
          url.searchParams.set("view", "matrix");
        } else {
          url.searchParams.delete("view");
        }
        window.history.pushState(null, "", url.pathname + url.search);
      } catch {
        toast.error("加载发布日历失败，请重试");
      } finally {
        setIsLoadingCalendar(false);
      }
    },
    [mainView],
  );

  const handlePresetChange = useCallback(
    (
      targetPreset: TimeRangePreset,
      targetYear: number,
      targetMonth: number,
    ) => {
      setRange(targetPreset);
      loadCalendar(targetYear, targetMonth, targetPreset);
    },
    [loadCalendar],
  );

  const handleMonthChange = useCallback(
    (targetYear: number, targetMonth: number) => {
      loadCalendar(targetYear, targetMonth, range);
    },
    [loadCalendar, range],
  );

  const refreshVisibleCalendar = useCallback(async () => {
    setIsLoadingCalendar(true);
    try {
      const response = await fetch(
        `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("日历未能刷新");
      const payload = await response.json();
      setCalendarData(payload.data);
    } catch {
      toast.error("审批已保存，日历同步稍有延迟，刷新即可查看最新状态");
    } finally {
      setIsLoadingCalendar(false);
    }
  }, [calendarData.month, calendarData.year]);

  useEffect(() => {
    const handleFulfillmentDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<FulfillmentDataChangedDetail>).detail;
      if (detail?.source === "command-hub") void refreshVisibleCalendar();
    };
    window.addEventListener(
      FULFILLMENT_DATA_CHANGED_EVENT,
      handleFulfillmentDataChanged,
    );
    return () => {
      window.removeEventListener(
        FULFILLMENT_DATA_CHANGED_EVENT,
        handleFulfillmentDataChanged,
      );
    };
  }, [refreshVisibleCalendar]);

  // 9. 客户端过滤与统计
  const filteredMembers = useMemo(
    () => filterMembers(calendarData.members, selectedTeam, range, today),
    [calendarData.members, selectedTeam, range, today],
  );

  const exceptionMembers = useMemo(() => {
    // 异常队列：待处理 unconfirmed 成员
    const exceptions = filteredMembers.filter(
      (m) => m.days[today]?.status === "unconfirmed",
    );
    return sortExceptions(exceptions, today);
  }, [filteredMembers, today]);

  const pendingAppeals = useMemo(() => {
    if (!Array.isArray(appeals)) return [];
    // 过滤出当前管理范围内的 pending 申诉
    const visibleUserSet = new Set(calendarData.members.map((m) => m.userId));
    return appeals.filter(
      (a) => a.status === "pending" && visibleUserSet.has(a.user_id),
    );
  }, [appeals, calendarData.members]);

  const stats = useMemo(
    () => calcStats(filteredMembers, today),
    [filteredMembers, today],
  );

  const handleTeamChange = useCallback((team: string | null) => {
    setSelectedTeam(team);
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
    (selected: boolean, targetUserIds?: string[]) => {
      if (selected) {
        if (targetUserIds && targetUserIds.length > 0) {
          setSelectedIds((prev) => new Set([...prev, ...targetUserIds]));
        } else {
          setSelectedIds(new Set(exceptionMembers.map((m) => m.userId)));
        }
      } else {
        if (targetUserIds && targetUserIds.length > 0) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            targetUserIds.forEach((id) => next.delete(id));
            return next;
          });
        } else {
          setSelectedIds(new Set());
        }
      }
    },
    [exceptionMembers],
  );

  const handleQueueMemberClick = useCallback(
    (member: FulfillmentMemberSummary) => {
      queueRef.current = exceptionMembers;
      queueIndexRef.current = exceptionMembers.findIndex(
        (m) => m.userId === member.userId,
      );
      setSelectedMember(member);
      setSelectedDate(today);
      setSource("queue");
      setSheetOpen(true);
    },
    [exceptionMembers, today],
  );

  const handleMatrixCellClick = useCallback(
    (member: FulfillmentMemberSummary, date: string) => {
      setSelectedMember(member);
      setSelectedDate(date);
      setSource("matrix");
      setSheetOpen(true);
    },
    [],
  );

  const handleReviewPendingExemption = useCallback(
    async (requestId: string, action: "approved" | "rejected") => {
      const response = await fetch("/api/exemptions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, action, feedback: null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "未能保存审批结果" }));
        throw new Error(payload.error || "未能保存审批结果");
      }
      await refreshVisibleCalendar();
      dispatchFulfillmentDataChanged({
        source: "fulfillment-calendar",
        requestIds: [requestId],
      });
    },
    [refreshVisibleCalendar],
  );

  // 10. 操作回调
  const handleActionComplete = useCallback(() => {
    setSelectedIds(new Set());

    // 重新拉取最新的日历和申诉
    fetchAppeals();
    fetch(
      `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
    ).then(async (res) => {
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
        setSelectedMember(nextMember);
        setSelectedDate(today);
      } else {
        setSheetOpen(false);
      }
    } else {
      setSheetOpen(false);
    }
  }, [source, today, calendarData.year, calendarData.month, fetchAppeals]);

  const handleQuickMarkCell = useCallback(
    async (userId: string, date: string, action: MarkAction) => {
      try {
        const res = await fetch("/api/admin/fulfillment/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            recordDate: date,
            status: action,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "改判失败" }));
          toast.error(err.error || "改判失败");
          return;
        }
        fetchAppeals();
        const calendarRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (calendarRes.ok) {
          const refreshResult = await calendarRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch {
        toast.error("网络错误，改判失败");
      }
    },
    [calendarData.year, calendarData.month, fetchAppeals],
  );

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
          let publishedCount = 0;
          let requiredCount = 0;
          Object.values(nextDays).forEach((d) => {
            publishedCount += d.publishedCount;
            if (d.status === "published" || d.status === "confirmed_published")
              publishedDays++;
            else if (d.status === "leave") leaveDays++;
            else if (d.status === "waived" || d.status === "exempted")
              waivedDays++;
            else if (d.status === "absent") absentDays++;
            if (d.status !== "leave" && d.status !== "waived" && d.status !== "exempted") {
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
        trackUsageEvent({
          path: "/admin/fulfillment",
          eventType: "mark_fulfillment_status",
        });

        // 后台静默刷新以同步统计大盘
        const refreshRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (refreshRes.ok) {
          const refreshResult = await refreshRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "标记失败，已回滚");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, calendarData.year, calendarData.month, today],
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
          let publishedCount = 0;
          let requiredCount = 0;
          Object.values(nextDays).forEach((d) => {
            publishedCount += d.publishedCount;
            if (d.status === "published" || d.status === "confirmed_published")
              publishedDays++;
            else if (d.status === "leave") leaveDays++;
            else if (d.status === "waived" || d.status === "exempted")
              waivedDays++;
            else if (d.status === "absent") absentDays++;
            if (d.status !== "leave" && d.status !== "waived" && d.status !== "exempted") {
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
        trackUsageEvent({
          path: "/admin/fulfillment",
          eventType: "mark_fulfillment_status",
        });

        // 后台静默刷新以同步统计大盘
        const refreshRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (refreshRes.ok) {
          const refreshResult = await refreshRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "批量标记失败，已回滚",
        );
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, calendarData.year, calendarData.month, today],
  );

  const totalExceptions = exceptionMembers.length + pendingAppeals.length;

  return (
    <AdminWorkspaceLayout
      eyebrow="FULFILLMENT DISPATCH · 履约大盘"
      title="发布与履约总览"
      description="随时了解每位成员的发布节奏，断更与申诉都有去处。"
      indexItems={[]}
      width="wide"
      actions={
        <div className="inline-flex items-center gap-1 rounded-xl bg-[#F5F3EE] p-1 border border-[#ECE7DE]/70 shadow-2xs">
          <button
            type="button"
            onClick={() => handleViewChange("todo")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] sm:text-[12.5px] font-medium transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
              mainView === "todo"
                ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-white/50"
            }`}
          >
            <span>异常待办</span>
            {totalExceptions > 0 ? (
              <span className="inline-flex items-center justify-center rounded-full bg-[#D97757]/15 px-1.5 py-0.2 text-[11px] font-semibold text-[#D97757] tabular-nums">
                {totalExceptions}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center rounded-full bg-[#6FAA7D]/10 px-1.5 py-0.2 text-[11px] font-medium text-[#6FAA7D]">
                0
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("matrix")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] sm:text-[12.5px] font-medium transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
              mainView === "matrix"
                ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-white/50"
            }`}
          >
            <span>月度全景</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 单行工具栏：时间预设 + 团队筛选 + 飞书开关 */}
        <FilterBar
          year={calendarData.year}
          month={calendarData.month}
          range={range}
          members={calendarData.members}
          selectedTeam={selectedTeam}
          onTeamChange={handleTeamChange}
          onPresetChange={handlePresetChange}
          feishuEnabled={feishuEnabled}
          settingsLoading={settingsLoading}
          settingsError={settingsError}
          isUpdatingSettings={isUpdatingSettings}
          onRetrySettings={() => void loadSettings()}
          onFeishuChange={handleFeishuChange}
        />

        {mainView === "todo" ? (
          <>
            {/* 统计条 */}
            <StatsBar stats={stats} />

            {/* P0 — 待处理工作流 (Tab 整合：异常处理队列 与 待处理申诉列表) */}
            <section className="space-y-3">
              <Tabs defaultValue="exceptions" className="w-full">
                <div className="flex items-center justify-between border-b border-[#E5E0D6] pb-2">
                  <TabsList variant="line" className="gap-4">
                    <TabsTrigger value="exceptions" className="text-[13px] font-medium text-[#78716C] data-[state=active]:text-[#1C1917]">
                      待处理异常
                      <span className="ml-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F3EE] text-[#78716C] tabular-nums">
                        {exceptionMembers.length}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="appeals" className="text-[13px] font-medium text-[#78716C] data-[state=active]:text-[#1C1917]">
                      待审核申诉
                      {appealsError ? (
                        <span className="ml-1.5 rounded-full bg-[#C0685C]/10 px-1.5 py-0.5 text-[11px] text-[#C0685C] font-semibold">
                          !
                        </span>
                      ) : pendingAppeals.length > 0 ? (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#D97757]/15 text-[#D97757] font-semibold tabular-nums">
                          <span className="size-1.5 rounded-full bg-[#D97757]" />
                          {pendingAppeals.length}
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F3EE] text-[#78716C] tabular-nums">
                          0
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="exceptions" className="mt-3">
                  {isLoadingCalendar ? (
                    <div className="flex items-center justify-center py-12 rounded-xl border border-[#ECE7DE] bg-white">
                      <span className="size-5 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2" />
                      <span className="text-[13px] text-[#78716C] font-normal">
                        正在刷新数据...
                      </span>
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
                    <div className="flex flex-col items-center justify-center rounded-xl border border-[#ECE7DE] bg-[#FAF8F4] px-6 py-10 text-center">
                      <p className="text-[13px] font-medium text-[#1C1917]">
                        申诉数据加载稍有阻滞
                      </p>
                      <p className="mt-1 text-[12px] text-[#78716C]">{appealsError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-lg text-[#292524] border-[#E5E0D6] hover:bg-[#F5F3EE] active:scale-[0.99] active:duration-120"
                        onClick={() => void fetchAppeals()}
                      >
                        重新加载
                      </Button>
                    </div>
                  ) : appealsLoading || isSubmittingAppeal ? (
                    <div className="flex items-center justify-center py-12 rounded-xl border border-[#ECE7DE]/80 bg-white shadow-2xs">
                      <span className="size-4 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2.5" />
                      <span className="text-[12.5px] text-[#78716C] font-normal">
                        正在加载申诉...
                      </span>
                    </div>
                  ) : pendingAppeals.length === 0 ? (
                    <div className="rounded-xl bg-white py-12 shadow-card-ring">
                      <EmptyState
                        title="还没有待审核的申诉"
                        description="所有成员的申诉请求已处理完毕"
                      />
                    </div>
                  ) : (
                    <div className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                          <thead>
                            <tr className="border-b border-[#ECE7DE]/80 bg-transparent">
                              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                成员
                              </th>
                              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                申诉日期
                              </th>
                              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                申诉原因
                              </th>
                              <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                提交时间
                              </th>
                              <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                操作
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingAppeals.map((appeal) => (
                              <tr
                                key={appeal.id}
                                className="border-b border-[#ECE7DE]/60 last:border-b-0 hover:bg-[#F5F3EE]/40 bg-transparent transition-colors duration-100"
                              >
                                <td className="px-3 py-2.5 font-medium text-[#1C1917]">
                                  {appeal.user_name || "未知成员"}
                                </td>
                                <td className="px-3 py-2.5 text-[12px] tabular-nums text-[#292524]">
                                  {appeal.record_date}
                                </td>
                                <td
                                  className="max-w-[240px] truncate px-3 py-2.5 text-[#292524]"
                                  title={appeal.reason}
                                >
                                  {appeal.reason}
                                </td>
                                <td className="px-3 py-2.5 text-[12px] tabular-nums text-[#78716C]">
                                  {new Date(appeal.created_at).toLocaleString(
                                    "zh-CN",
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2.5 text-[12px] text-[#6FAA7D] hover:bg-[#6FAA7D]/10 font-medium rounded-lg active:scale-[0.99] active:duration-120"
                                      onClick={() =>
                                        handleHandleAppeal(appeal.id, "approve")
                                      }
                                    >
                                      同意并改判
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2.5 text-[12px] text-[#C0685C] hover:bg-[#C0685C]/10 font-medium rounded-lg active:scale-[0.99] active:duration-120"
                                      onClick={() =>
                                        handleHandleAppeal(appeal.id, "reject")
                                      }
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

            {/* 底部导航提示 */}
            <div className="pt-2 flex items-center justify-between text-[12px] text-[#78716C]">
              <span>需要查看全月 31 天走势与热力图？</span>
              <button
                type="button"
                onClick={() => handleViewChange("matrix")}
                className="inline-flex items-center gap-1 font-medium text-[#D97757] hover:underline cursor-pointer transition-colors"
              >
                切换到「月度全景」大盘 →
              </button>
            </div>
          </>
        ) : (
          /* P2 — 月度矩阵全景大盘 */
          <section className="space-y-4">
            {isLoadingCalendar ? (
              <div className="flex items-center justify-center py-16 rounded-xl bg-white shadow-card-ring">
                <span className="size-4 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2.5" />
                <span className="text-[13px] font-normal text-[#78716C]">
                  正在刷新日历数据...
                </span>
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
                onQuickMarkCell={handleQuickMarkCell}
                onReviewPendingExemption={handleReviewPendingExemption}
              />
            )}
          </section>
        )}

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
    </AdminWorkspaceLayout>
  );
}
