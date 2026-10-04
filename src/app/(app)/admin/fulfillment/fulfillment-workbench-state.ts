"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  FulfillmentAppeal,
  FulfillmentCalendarData,
  FulfillmentMemberSummary,
  TimeRangePreset,
} from "@/types/fulfillment";
import type { StatsFilterMode } from "./components/fulfillment-stats-overview";
import { useFulfillmentWorkbenchSelection } from "./fulfillment-workbench-selection";
import {
  calcStats,
  filterMembers,
  formatTodayDateOnly,
  sortExceptions,
} from "@/lib/fulfillment/domain/workbench";
import {
  fetchFulfillmentAppeals,
  loadFulfillmentSettings,
} from "@/lib/fulfillment/data/workbench";
import {
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";

type Source = "queue" | "matrix";

export interface FulfillmentWorkbenchStateProps {
  initialData: FulfillmentCalendarData;
  initialRange: TimeRangePreset;
  currentUserId?: string;
  canManageSystem: boolean;
  canManage: boolean;
}

export function useFulfillmentWorkbenchState({
  initialData,
  initialRange,
  currentUserId,
  canManageSystem,
  canManage,
}: FulfillmentWorkbenchStateProps) {
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
    if (!canManage) {
      setAppeals([]);
      return;
    }
    try {
      setAppeals(await fetchFulfillmentAppeals());
    } catch (err) {
      console.error("加载申诉失败", err);
      setAppeals([]);
    }
  }, [canManage]);

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

  const selection = useFulfillmentWorkbenchSelection({
    exceptionMembers,
    today,
    setSelectedTeam,
    setSelectedIds,
    setStatsFilterMode,
    setSelectedMember,
    setSelectedDate,
    setSource,
    setSheetOpen,
    queueRef,
    queueIndexRef,
  });

  return {
    today,
    calendarData,
    setCalendarData,
    range,
    setRange,
    isLoadingCalendar,
    setIsLoadingCalendar,
    feishuEnabled,
    setFeishuEnabled,
    settingsLoading,
    setSettingsLoading,
    settingsError,
    setSettingsError,
    isUpdatingSettings,
    setIsUpdatingSettings,
    appeals,
    setAppeals,
    selectedTeam,
    selectedIds,
    setSelectedIds,
    statsFilterMode,
    setStatsFilterMode,
    sheetOpen,
    setSheetOpen,
    selectedMember,
    setSelectedMember,
    selectedDate,
    setSelectedDate,
    source,
    queueRef,
    queueIndexRef,
    fetchAppeals,
    loadSettings,
    loadCalendar,
    refreshVisibleCalendar,
    filteredMembers,
    exceptionMembers,
    pendingActionableCount,
    stats,
    ...selection,
  };
}

export type FulfillmentWorkbenchState = ReturnType<typeof useFulfillmentWorkbenchState>;
