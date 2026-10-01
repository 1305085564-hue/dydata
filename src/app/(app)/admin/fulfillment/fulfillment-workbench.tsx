"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import type {
  FulfillmentAppeal,
  FulfillmentCalendarData,
  FulfillmentDayRecord,
  FulfillmentMemberSummary,
  FulfillmentStatus,
  TimeRangePreset,
} from "@/types/fulfillment";
import { FilterBar } from "./components/filter-bar";
import {
  FulfillmentStatsOverview,
  type StatsFilterMode,
} from "./components/fulfillment-stats-overview";
import { FulfillmentActionDock } from "./components/fulfillment-action-dock";
import { FulfillmentMatrixRoster } from "./components/fulfillment-matrix-roster";
import { FulfillmentMemberSheet } from "./components/fulfillment-member-sheet";
import { Card } from "@/components/ui/card";
import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  dispatchFulfillmentDataChanged,
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";
import {
  countsTowardFulfillmentRequirement,
  isFulfilledFulfillmentStatus,
  isWaivedFulfillmentStatus,
  isManualFulfillmentMarkStatus,
  FULFILLMENT_ACTION_LABELS,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";

type Source = "queue" | "matrix";
type MarkAction = ManualFulfillmentMarkStatus;
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
): Promise<boolean | null> {
  const response = await request("/api/admin/system/settings");
  if (response.status === 403) {
    // 非系统管理员（如组长），无权限读写系统配置，返回 null 供前端优雅降级展示
    return null;
  }
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

export async function loadFulfillmentSettings(
  canManageSystem: boolean,
  request: FulfillmentRequest = fetch,
): Promise<boolean | null> {
  if (!canManageSystem) {
    return null;
  }
  return fetchFulfillmentSettings(request);
}

interface FulfillmentWorkbenchProps {
  initialData: FulfillmentCalendarData;
  initialRange: TimeRangePreset;
  initialView?: "todo" | "matrix";
  currentUserId?: string;
  canManageSystem?: boolean;
}

function formatTodayDateOnly() {
  return formatShanghaiDateOnly();
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
      const cutoffStr = shiftDateOnly(new Date(`${today}T12:00:00+08:00`), -6);
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

function calcStats(members: FulfillmentMemberSummary[], today: string) {
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

export function FulfillmentWorkbench({
  initialData,
  initialRange,
  initialView = "matrix",
  currentUserId,
  canManageSystem = false,
}: FulfillmentWorkbenchProps) {
  const today = formatTodayDateOnly();

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

  // 2. 飞书自动催交总开关状态 (null 表示无权限配置/非系统管理员)
  const [feishuEnabled, setFeishuEnabled] = useState<boolean | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(canManageSystem);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // 3. 申诉状态
  const [appeals, setAppeals] = useState<FulfillmentAppeal[]>([]);

  // 4. 选择与抽屉状态
  const [selectedTeam, setSelectedTeam] = useState<string | null>(defaultTeam);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statsFilterMode, setStatsFilterMode] = useState<StatsFilterMode>("all");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<FulfillmentMemberSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("queue");

  const queueRef = useRef<FulfillmentMemberSummary[]>([]);
  const queueIndexRef = useRef<number>(-1);

  // 5. 初始化配置加载与申诉加载
  const fetchAppeals = useCallback(async () => {
    try {
      setAppeals(await fetchFulfillmentAppeals());
    } catch (err) {
      console.error("加载申诉失败", err);
      setAppeals([]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!canManageSystem) {
      setFeishuEnabled(null);
      setSettingsLoading(false);
      setSettingsError(null);
      return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      setFeishuEnabled(await loadFulfillmentSettings(canManageSystem));
    } catch (err) {
      console.error("加载飞书设置失败", err);
      setSettingsError(err instanceof Error ? err.message : "设置读取失败");
    } finally {
      setSettingsLoading(false);
    }
  }, [canManageSystem]);

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
    } catch {
      toast.error("更新飞书催交配置失败，已回滚");
      setFeishuEnabled(!checked);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // 8. 客户端无感日历加载器
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
        window.history.pushState(null, "", url.pathname + url.search);
      } catch {
        toast.error("加载发布日历失败，请重试");
      } finally {
        setIsLoadingCalendar(false);
      }
    },
    [],
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

  // 7. 处理申诉审批动作（依赖 refreshVisibleCalendar 反馈日历同步结果）
  const handleHandleAppeal = useCallback(
    async (appealId: string, decision: "approve" | "reject") => {
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

        await fetchAppeals();
        await refreshVisibleCalendar();
      } catch {
        toast.error("处理申诉发生网络错误");
      }
    },
    [fetchAppeals, refreshVisibleCalendar],
  );

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

  // 有待审事项的判定：今日有待审请假或待审申诉（与 StatsBar 待审人数同口径）
  const isPendingActionable = useCallback(
    (m: FulfillmentMemberSummary) => {
      const hasPendingAppeal = (appeals || []).some(
        (a) => a.status === "pending" && a.user_id === m.userId,
      );
      return hasPendingAppeal || Boolean(m.days[today]?.pendingExemption);
    },
    [appeals, today],
  );

  const exceptionMembers = useMemo(() => {
    // 异常队列：待处理 unconfirmed 成员
    let exceptions = filteredMembers.filter(
      (m) => m.days[today]?.status === "unconfirmed",
    );
    if (statsFilterMode === "missing") {
      exceptions = exceptions.filter((m) => m.consecutiveMissing > 0);
    } else if (statsFilterMode === "pending") {
      exceptions = exceptions.filter(isPendingActionable);
    }

    return sortExceptions(exceptions, today);
  }, [filteredMembers, today, statsFilterMode, isPendingActionable]);

  // 与 pending 筛选同口径的待审人数：今日未确认且有待审申诉或待审请假
  const pendingActionableCount = useMemo(
    () =>
      filteredMembers.filter(
        (m) => m.days[today]?.status === "unconfirmed" && isPendingActionable(m),
      ).length,
    [filteredMembers, today, isPendingActionable],
  );

  const stats = useMemo(
    () => calcStats(filteredMembers, today),
    [filteredMembers, today],
  );

  const handleTeamChange = useCallback((team: string | null) => {
    setSelectedTeam(team);
    setSelectedIds(new Set());
  }, []);

  // 指标筛选切换会改变队列可见集合，必须同步清空已选，避免批量操作命中隐藏成员
  const handleStatsFilterChange = useCallback((mode: StatsFilterMode) => {
    setStatsFilterMode(mode);
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

  const handleUndoMark = useCallback(
    async (
      userId: string,
      date: string,
      expectedCurrentStatus: MarkAction,
      prevRecord?: FulfillmentDayRecord,
    ) => {
      // 1. 防御竞态：若当前格子已被后续操作变更，则安全阻断，避免覆盖更新的决策
      const currentTargetMember = calendarData.members.find((m) => m.userId === userId);
      const currentCellStatus = currentTargetMember?.days[date]?.status;
      if (currentCellStatus && currentCellStatus !== expectedCurrentStatus) {
        toast.info("该记录已发生后续调整，无法撤销旧操作");
        return;
      }

      const originalMembers = calendarData.members;
      const userName = currentTargetMember?.userName || "成员";
      const dateLabel = formatDisplayDate(date, today);
      const prevStatus = prevRecord?.status;

      // 乐观回滚
      if (prevStatus) {
        setCalendarData((prev) => ({
          ...prev,
          members: updateMemberDayOptimistically(
            prev.members,
            userId,
            date,
            prevStatus,
          ),
        }));
      }

      try {
        if (prevStatus && isManualFulfillmentMarkStatus(prevStatus)) {
          const res = await fetch("/api/admin/fulfillment/mark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              recordDate: date,
              status: prevStatus,
              reason: prevRecord?.reason || "",
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "撤销失败" }));
            throw new Error(err.error || "撤销失败");
          }
        } else {
          const res = await fetch("/api/admin/fulfillment/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              recordDate: date,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "撤销失败" }));
            throw new Error(err.error || "撤销失败");
          }
        }

        toast.success(`已撤销对 ${userName} ${dateLabel} 的标记`);
        void fetchAppeals();
        void refreshVisibleCalendar();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "撤销失败，请重试");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, fetchAppeals, refreshVisibleCalendar, today],
  );

  const handleQuickMarkCell = useCallback(
    async (userId: string, date: string, action: MarkAction) => {
      const originalMembers = calendarData.members;
      const targetMember = originalMembers.find((m) => m.userId === userId);
      const prevRecord = targetMember?.days[date];
      const userName = targetMember?.userName || "成员";
      const actionLabel = FULFILLMENT_ACTION_LABELS[action] || action;
      const dateLabel = formatDisplayDate(date, today);

      // 乐观更新
      setCalendarData((prev) => ({
        ...prev,
        members: updateMemberDayOptimistically(
          prev.members,
          userId,
          date,
          action,
        ),
      }));

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
          throw new Error(err.error || "改判失败");
        }

        toast.success(`已将 ${userName} ${dateLabel} 标记为「${actionLabel}」`, {
          action: {
            label: "撤销",
            onClick: () => {
              void handleUndoMark(userId, date, action, prevRecord);
            },
          },
          duration: 5000,
        });

        trackUsageEvent({
          path: "/admin/fulfillment",
          eventType: "mark_fulfillment_status",
        });

        void fetchAppeals();
        const calendarRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (calendarRes.ok) {
          const refreshResult = await calendarRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "网络错误，改判失败");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [
      calendarData.members,
      calendarData.year,
      calendarData.month,
      fetchAppeals,
      handleUndoMark,
      today,
    ],
  );

  // 11. 快速与批量打标的乐观更新机制
  const handleQuickMark = useCallback(
    async (userId: string, status: MarkAction) => {
      const originalMembers = calendarData.members;
      const targetMember = originalMembers.find((m) => m.userId === userId);
      const prevRecord = targetMember?.days[today];
      const userName = targetMember?.userName || "成员";
      const actionLabel = FULFILLMENT_ACTION_LABELS[status] || status;

      // 乐观更新状态
      setCalendarData((prev) => ({
        ...prev,
        members: updateMemberDayOptimistically(
          prev.members,
          userId,
          today,
          status,
        ),
      }));

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

        toast.success(`已将 ${userName} 今日标记为「${actionLabel}」`, {
          action: {
            label: "撤销",
            onClick: () => {
              void handleUndoMark(userId, today, status, prevRecord);
            },
          },
          duration: 5000,
        });

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
    [
      calendarData.members,
      calendarData.year,
      calendarData.month,
      handleUndoMark,
      today,
    ],
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
            if (isFulfilledFulfillmentStatus(d.status))
              publishedDays++;
            else if (d.status === "leave") leaveDays++;
            else if (isWaivedFulfillmentStatus(d.status))
              waivedDays++;
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

  return (
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

      {/* 顶层战报大盘 */}
      <FulfillmentStatsOverview
        stats={stats}
        activeFilter={statsFilterMode}
        onFilterChange={handleStatsFilterChange}
        pendingCount={pendingActionableCount}
      />

      {/* 异常待办行动港（可折叠轻量提示 / 展开批量处理与申诉裁决） */}
      <FulfillmentActionDock
        members={exceptionMembers}
        today={today}
        selectedIds={selectedIds}
        onSelectToggle={handleSelectToggle}
        onSelectAll={handleSelectAll}
        onQuickMark={handleQuickMark}
        onBatchMark={handleBatchMark}
        onMemberClick={handleQueueMemberClick}
        appeals={appeals}
        onHandleAppeal={handleHandleAppeal}
        isFiltered={statsFilterMode !== "all"}
        onClearFilter={() => handleStatsFilterChange("all")}
        defaultExpanded={initialView === "todo"}
      />

      {/* 月度矩阵全景大盘 */}
      <section className="space-y-4">
        {isLoadingCalendar ? (
          <Card className="flex items-center justify-center py-16 gap-0">
            <span className="size-4 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2.5" />
            <span className="text-[13px] font-normal text-[#78716C]">
              正在刷新日历数据...
            </span>
          </Card>
        ) : (
          <FulfillmentMatrixRoster
            year={calendarData.year}
            month={calendarData.month}
            members={filteredMembers}
            today={today}
            onCellClick={handleMatrixCellClick}
            onMonthChange={handleMonthChange}
            appeals={appeals}
            onQuickMarkCell={handleQuickMarkCell}
            onReviewPendingExemption={handleReviewPendingExemption}
            range={range}
          />
        )}
      </section>

      {/* 成员全月履约足迹与改判抽屉 */}
      <FulfillmentMemberSheet
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
