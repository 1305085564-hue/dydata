"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BoundedTtlCache } from "@/lib/cache-policy";
import { getApiFailureMessage } from "@/lib/api-failure-message";
import type {
  FulfillmentAppeal,
  FulfillmentCalendarData,
  FulfillmentMemberSummary,
} from "@/types/fulfillment";
import {
  collectPendingLeaves,
  countRosterSegments,
  filterRosterSegment,
  sortRoster,
  type RosterSegment,
  type RosterSortDir,
} from "./fulfillment-page-view";
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
  currentUserId?: string;
  canManageSystem: boolean;
  canManage: boolean;
}

export function useFulfillmentWorkbenchState({
  initialData,
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

  // 1. 核心状态：整月日历数据（页面始终看整月，翻月在页头）
  const [calendarData, setCalendarData] =
    useState<FulfillmentCalendarData>(initialData);
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
  const [segment, setSegment] = useState<RosterSegment>("all");
  const [sortDir, setSortDir] = useState<RosterSortDir>("asc");

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

  const [monthCache] = useState(() => {
    const cache = new BoundedTtlCache<FulfillmentCalendarData>({
      scope: "user", ttlMs: 60_000, maxEntries: 12, name: "fulfillment-client-months",
    });
    cache.set(`${initialData.year}-${initialData.month}`, initialData);
    return cache;
  });
  const committedMonth = useRef({ year: initialData.year, month: initialData.month });
  const calendarRequest = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const calendarTargetRef = useRef({ year: initialData.year, month: initialData.month });
  const [calendarTarget, setCalendarTarget] = useState(calendarTargetRef.current);
  useEffect(() => () => {
    calendarRequest.current.sequence += 1;
    calendarRequest.current.controller?.abort();
  }, []);

  // 8. 翻月与刷新共用同一请求序号，旧响应不能回写日历或地址栏。
  const loadCalendar = useCallback(
    async (targetYear: number, targetMonth: number, fresh = false, updateUrl = true) => {
      calendarRequest.current.controller?.abort();
      const controller = new AbortController();
      const sequence = ++calendarRequest.current.sequence;
      calendarRequest.current.controller = controller;
      const isCurrent = () => sequence === calendarRequest.current.sequence && !controller.signal.aborted;
      calendarTargetRef.current = { year: targetYear, month: targetMonth };
      setCalendarTarget(calendarTargetRef.current);
      setIsLoadingCalendar(true);
      let res: Response | undefined;
      let committed = false;
      try {
        if (fresh) monthCache.clear();
        const cacheKey = `${targetYear}-${targetMonth}`;
        const cached = monthCache.get(cacheKey);
        let result: { data: FulfillmentCalendarData };
        if (cached) {
          result = { data: cached };
        } else {
        res = await fetch(
          `/api/admin/fulfillment/calendar?year=${targetYear}&month=${targetMonth}${fresh ? "&fresh=1" : ""}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!isCurrent()) return;
        if (!res.ok) {
          const message = await getApiFailureMessage(res, "发布日历没能加载出来");
          if (isCurrent()) toast.error(message);
          return;
        }
        result = await res.json();
        if (!isCurrent()) return;
        monthCache.set(cacheKey, result.data);
        }
        if (!isCurrent()) return;
        const changedMonth = committedMonth.current.year !== targetYear || committedMonth.current.month !== targetMonth;
        committedMonth.current = { year: targetYear, month: targetMonth };
        committed = true;
        setCalendarData(result.data);
        if (updateUrl || changedMonth) {
          const url = new URL(window.location.href);
          url.searchParams.set("year", String(targetYear));
          url.searchParams.set("month", String(targetMonth));
          url.searchParams.delete("range");
          url.searchParams.delete("view");
          window.history.pushState(null, "", url.pathname + url.search);
        }
      } catch {
        const message = await getApiFailureMessage(res, "发布日历没能加载出来");
        if (isCurrent()) toast.error(message);
      } finally {
        if (isCurrent()) {
          if (!committed) {
            calendarTargetRef.current = committedMonth.current;
            setCalendarTarget(committedMonth.current);
          }
          setIsLoadingCalendar(false);
        }
      }
    },
    [monthCache],
  );

  const stepCalendarMonth = useCallback((delta: -1 | 1) => {
    const { year, month } = calendarTargetRef.current;
    const target = new Date(year, month - 1 + delta, 1);
    return loadCalendar(target.getFullYear(), target.getMonth() + 1);
  }, [loadCalendar]);

  const refreshVisibleCalendar = useCallback(() => {
    const { year, month } = calendarTargetRef.current;
    return loadCalendar(year, month, true, false);
  }, [loadCalendar]);

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

  // 9. 客户端过滤与统计：团队收窄 → 统计与分段计数；分段只收窄大表，不改页头数字
  const filteredMembers = useMemo(
    () => filterMembers(calendarData.members, selectedTeam),
    [calendarData.members, selectedTeam],
  );

  const segmentCounts = useMemo(() => countRosterSegments(filteredMembers), [filteredMembers]);

  const rosterMembers = useMemo(
    () => sortRoster(filterRosterSegment(filteredMembers, segment), segment, sortDir),
    [filteredMembers, segment, sortDir],
  );

  // 今天待处理：今天还没发、也没人标记过的成员
  const exceptionMembers = useMemo(
    () =>
      sortExceptions(
        filteredMembers.filter((m) => m.days[today]?.status === "unconfirmed"),
        today,
      ),
    [filteredMembers, today],
  );

  const pendingLeaves = useMemo(() => collectPendingLeaves(filteredMembers), [filteredMembers]);

  const stats = useMemo(
    () => calcStats(filteredMembers, today),
    [filteredMembers, today],
  );

  const selection = useFulfillmentWorkbenchSelection({
    exceptionMembers,
    today,
    setSelectedTeam,
    setSelectedIds,
    setSegment,
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
    segment,
    segmentCounts,
    sortDir,
    setSortDir,
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
    stepCalendarMonth,
    calendarTarget,
    refreshVisibleCalendar,
    filteredMembers,
    rosterMembers,
    exceptionMembers,
    pendingLeaves,
    stats,
    ...selection,
  };
}

export type FulfillmentWorkbenchState = ReturnType<typeof useFulfillmentWorkbenchState>;
