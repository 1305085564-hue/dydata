import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_SORT_DIR, type ContentListProps, type SortField } from "@/lib/content/domain/content-list";
import { CONTENT_PAGE_SIZE_OPTIONS, DEFAULT_CONTENT_PAGE_SIZE } from "@/lib/content/domain/content-list-query";
import { DEFAULT_CONTENT_LIST_FILTERS, CUSTOM_PLAY_BUCKET_KEY, PLAY_BUCKETS, getSecondaryFilterSummary, isSingleDayMode, parseContentListFilters, parseContentListSort, resolveEffectiveDates, writeContentListFilters, writeContentListSort, type ContentListFilterValue, type TimeRangePreset } from "@/app/(app)/admin/content/content-list-filters";
import { classifyVideoAnomalyBucket } from "@/lib/video-anomaly";
import type { HighlightFieldKey, HighlightRule } from "@/lib/content/domain/content-list-highlight";

function resetPageParams(params: URLSearchParams) {
  params.delete("page");
  params.delete("cursor");
  return params;
}

export function useContentListState(props: ContentListProps) {
  const {
    videos,
    profiles,
    accountOptions: suppliedAccountOptions,
    view = "all",
    onViewChange,
    perspective = "company",
    onPerspectiveChange,
    teamId = null,
    onTeamChange,
    teams = [],
    canSwitchPerspective = false,
    canManageVideos = false,
    canReviewContent = true,
    onDirectReview,
  } = props;

  const searchParams = useSearchParams();
  const [metricViewMode, setMetricViewMode] = useState<"full" | "spacious">("full");
  const [filters, setFilters] = useState<ContentListFilterValue>(() =>
    parseContentListFilters(searchParams),
  );
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  // 排序与其余筛选同源：初值从 URL 读，非法入参由 parseContentListSort 安全回落默认
  const [sortField, setSortField] = useState<SortField>(() => parseContentListSort(searchParams).sortField);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => parseContentListSort(searchParams).sortDir);
  // 用户是否手动改过排序：初值＝URL 里有没有 sort（默认排序不写 URL），点表头即置位。
  // 用 state 而非 ref：渲染期要据它决定是否套用「单日默认播放量降序」。
  const [manualSorted, setManualSorted] = useState(() => searchParams.has("sort"));
  const [currentPage, setCurrentPage] = useState(() => {
    const value = Number(searchParams.get("page"));
    return Number.isInteger(value) && value > 0 ? value : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize"));
    return CONTENT_PAGE_SIZE_OPTIONS.includes(value as (typeof CONTENT_PAGE_SIZE_OPTIONS)[number])
      ? value
      : DEFAULT_CONTENT_PAGE_SIZE;
  });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFiltersFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters(parseContentListFilters(params));
      // 排序也随浏览器前进/后退一起恢复，避免「筛选变了、排序还是旧的」的错配
      const sort = parseContentListSort(params);
      setSortField(sort.sortField);
      setSortDir(sort.sortDir);
      const page = Number(params.get("page"));
      setCurrentPage(Number.isInteger(page) && page > 0 ? page : 1);
      const pageSize = Number(params.get("pageSize"));
      setPageSize(
        CONTENT_PAGE_SIZE_OPTIONS.includes(pageSize as (typeof CONTENT_PAGE_SIZE_OPTIONS)[number])
          ? pageSize
          : DEFAULT_CONTENT_PAGE_SIZE,
      );
    };
    window.addEventListener("popstate", syncFiltersFromUrl);
    return () => window.removeEventListener("popstate", syncFiltersFromUrl);
  }, []);

  const accountOptions = useMemo(() => {
    if (suppliedAccountOptions) return suppliedAccountOptions;
    // gate:transient-map temporary call-local projection
    const byId = new Map<string, string>();
    for (const video of videos) {
      if (video.account_id && video.accounts?.name) byId.set(video.account_id, video.accounts.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [suppliedAccountOptions, videos]);

  const accountMap = useMemo(() => {
    // gate:transient-map temporary call-local projection
    return new Map(accountOptions.map((a) => [a.id, a.name]));
  }, [accountOptions]);

  const secondarySummary = useMemo(() => {
    return getSecondaryFilterSummary(filters, accountMap);
  }, [filters, accountMap]);

  const updateFilter = useCallback((
    key: keyof ContentListFilterValue,
    value: ContentListFilterValue[keyof ContentListFilterValue],
  ) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setCurrentPage(1);
    const nextParams = resetPageParams(writeContentListFilters(new URLSearchParams(window.location.search), nextFilters));
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [filters]);

  /** 流量档位或组合条件需要一次改多个字段，沿用同一份 URL 同步与滚动复位 */
  const applyFilterPatch = useCallback((patch: Partial<ContentListFilterValue>) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    setCurrentPage(1);
    const nextParams = resetPageParams(writeContentListFilters(new URLSearchParams(window.location.search), nextFilters));
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [filters]);

  const toggleOnlyAnomaly = useCallback(() => {
    applyFilterPatch({ onlyAnomaly: !filters.onlyAnomaly });
  }, [filters.onlyAnomaly, applyFilterPatch]);

  const handleTimeRangeChange = useCallback((value: string | null) => {
    const nextRange = (value || "all") as TimeRangePreset;
    if (nextRange === "custom") {
      applyFilterPatch({ timeRange: "custom" });
    } else {
      applyFilterPatch({ timeRange: nextRange, startDate: "", endDate: "" });
    }
  }, [applyFilterPatch]);

  /** 按日期分页：切换到某一天（startDate = endDate = date），自动重置页码与游标 */
  const handleDateChange = useCallback((date: string) => {
    applyFilterPatch({ timeRange: "custom", startDate: date, endDate: date });
  }, [applyFilterPatch]);

  const handleClearSecondaryFilters = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    applyFilterPatch({
      accountId: "",
      playBucket: "",
      playMin: "",
      playMax: "",
      qualityGrade: "all",
      topicStatus: "all",
      highlightRules: {},
      highlightOnly: false,
    });
  }, [applyFilterPatch]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_CONTENT_LIST_FILTERS);
    setCurrentPage(1);
    const nextParams = resetPageParams(writeContentListFilters(new URLSearchParams(window.location.search), DEFAULT_CONTENT_LIST_FILTERS));
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /** 异常切片数字：跟着时间范围动态变（所见即所得） */
  const anomalyCountForTime = useMemo(() => {
    const { effectiveStartDate, effectiveEndDate } = resolveEffectiveDates(filters);
    let count = 0;
    for (const video of videos) {
      if (classifyVideoAnomalyBucket(video) === null) continue;
      const pub = video.published_at?.slice(0, 10) ?? "";
      if (effectiveStartDate && (!pub || pub < effectiveStartDate)) continue;
      if (effectiveEndDate && (!pub || pub > effectiveEndDate)) continue;
      if (filters.userId) {
        const owner = video.accounts?.profile_id ?? video.user_id;
        if (owner !== filters.userId) continue;
      }
      count++;
    }
    return count;
  }, [videos, filters]);
  // 用户没手动排过序时：单日默认按播放量降序，多日回到发布时间降序。
  // 用派生值而不是 effect，切换日期范围立即生效，不产生级联渲染。
  const autoSortActive = !manualSorted && isSingleDayMode(filters);
  const activeSortField: SortField = autoSortActive ? "play_count" : sortField;
  const activeSortDir: "asc" | "desc" = autoSortActive ? "desc" : sortDir;
  const handleSort = useCallback((field: SortField) => {
    setManualSorted(true);
    const nextSortField = field;
    const nextSortDir: "asc" | "desc" =
      activeSortField === field ? (activeSortDir === "desc" ? "asc" : "desc") : DEFAULT_SORT_DIR[field];
    setSortField(nextSortField);
    setSortDir(nextSortDir);
    setCurrentPage(1);
    // 与其余筛选走同一套 URL 读写：分享/刷新后排序才保持不变（审计 M1）
    const nextParams = resetPageParams(writeContentListSort(
      new URLSearchParams(window.location.search),
      { sortField: nextSortField, sortDir: nextSortDir },
    ));
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSortField, activeSortDir]);
  const hasActiveFilters =
    Object.entries(filters).some(([k, v]) => {
      if (k === "qualityGrade" || k === "topicStatus" || k === "timeRange") return v !== "all";
      if (k === "onlyAnomaly") return v === true;
      // highlightRules 是对象，{} 也 truthy，必须按"有没有规则"判断
      if (k === "highlightRules") return Object.keys(v).length > 0;
      return Boolean(v);
    });
  const emptyTitle = hasActiveFilters
    ? "当前筛选条件下没有视频"
    : view === "trash"
      ? "还没有归档视频"
      : "还没有视频";
  const emptyDescription = hasActiveFilters
    ? "请调整筛选条件，或点击“重置”查看全部视频"
    : view === "trash"
      ? "已归档的视频会显示在这里"
      : "当前范围内还没有可查看的视频";

  // 首项文案写明「全部」：此前是「人员」二字，语义上等同不限但没有「全部」字样，
  // 用户刚从某个成员切回来时无法确认是否已恢复全选（2026-10-11 审计 L1）
  const profileLabel = filters.userId
    ? profiles.find((profile) => profile.id === filters.userId)?.name ?? "全部成员"
    : "全部成员";
  const accountLabel = filters.accountId
    ? accountOptions.find((account) => account.id === filters.accountId)?.name ?? "全部账号"
    : "全部账号";

  const playLabel = (() => {
    if (!filters.playBucket) return "全部流量";
    if (filters.playBucket === CUSTOM_PLAY_BUCKET_KEY) {
      const { playMin, playMax } = filters;
      if (playMin && playMax) return `${playMin}-${playMax}`;
      if (playMin) return `≥${playMin}`;
      if (playMax) return `<${playMax}`;
      return "自定义区间";
    }
    return PLAY_BUCKETS.find((bucket) => bucket.key === filters.playBucket)?.label ?? "全部流量";
  })();

  const gradeLabel = (() => {
    switch (filters.qualityGrade) {
      case "excellent":
        return "优";
      case "good":
        return "良";
      case "fair":
        return "普";
      case "poor":
        return "劣";
      case "unrated":
        return "未评级";
      default:
        return "全部评级";
    }
  })();

  const topicStatusLabel = useMemo(() => {
    switch (filters.topicStatus) {
      case "in_library":
        return "已入库";
      case "removed":
        return "已移出";
      default:
        return "全部";
    }
  }, [filters.topicStatus]);

  // 选「全部流量」清 min/max；选预设档位也清 min/max（预设与自定义互斥）；
  // 选「自定义」保留用户已经填过的边界，避免来回切换丢数据。
  const handlePlayBucketChange = useCallback((value: string | null) => {
    if (!value || value === "all") applyFilterPatch({ playBucket: "", playMin: "", playMax: "" });
    else if (value === CUSTOM_PLAY_BUCKET_KEY) applyFilterPatch({ playBucket: CUSTOM_PLAY_BUCKET_KEY });
    else applyFilterPatch({ playBucket: value, playMin: "", playMax: "" });
  }, [applyFilterPatch]);

  /** 数据高亮：同字段重复添加即覆盖旧规则（规则列表里一个字段只有一条） */
  const handleAddHighlightRule = useCallback((key: HighlightFieldKey, rule: HighlightRule) => {
    applyFilterPatch({ highlightRules: { ...filters.highlightRules, [key]: rule } });
  }, [filters.highlightRules, applyFilterPatch]);

  const handleRemoveHighlightRule = useCallback((key: HighlightFieldKey) => {
    const nextRules = { ...filters.highlightRules };
    delete nextRules[key];
    const isEmpty = Object.keys(nextRules).length === 0;
    // 规则清空后「只看命中」失去意义，一并关掉，避免 URL 残留无效开关
    applyFilterPatch(isEmpty ? { highlightRules: {}, highlightOnly: false } : { highlightRules: nextRules });
  }, [filters.highlightRules, applyFilterPatch]);

  const handleToggleHighlightOnly = useCallback(() => {
    applyFilterPatch({ highlightOnly: !filters.highlightOnly });
  }, [filters.highlightOnly, applyFilterPatch]);

  const timeRangeLabel = useMemo(() => {
    switch (filters.timeRange) {
      case "yesterday":
        return "昨天";
      case "7d":
        return "近7天";
      case "30d":
        return "近30天";
      case "thisMonth":
        return "本月";
      case "custom":
        if (filters.startDate && filters.endDate) {
          return `${filters.startDate.slice(5)}~${filters.endDate.slice(5)}`;
        }
        return "自定义日期";
      default:
        return "全部时间";
    }
  }, [filters.timeRange, filters.startDate, filters.endDate]);

  const selectedTeamName = useMemo(() => {
    return teams?.find((t) => t.id === teamId)?.name;
  }, [teams, teamId]);

  return {
    metricViewMode,
    setMetricViewMode,
    filters,
    setFilters,
    isSecondaryOpen,
    setIsSecondaryOpen,
    sortField: activeSortField,
    sortDir: activeSortDir,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    tableContainerRef,
    accountOptions,
    secondarySummary,
    updateFilter,
    applyFilterPatch,
    toggleOnlyAnomaly,
    handleTimeRangeChange,
    handleDateChange,
    handleClearSecondaryFilters,
    handleResetFilters,
    anomalyCountForTime,
    handleSort,
    hasActiveFilters,
    emptyTitle,
    emptyDescription,
    profileLabel,
    accountLabel,
    playLabel,
    gradeLabel,
    topicStatusLabel,
    handlePlayBucketChange,
    handleAddHighlightRule,
    handleRemoveHighlightRule,
    handleToggleHighlightOnly,
    timeRangeLabel,
    selectedTeamName,
    view,
    onViewChange,
    perspective,
    onPerspectiveChange,
    teamId,
    onTeamChange,
    teams,
    canSwitchPerspective,
    canManageVideos,
    canReviewContent,
    onDirectReview,
    profiles,
    PLAY_BUCKETS,
    CUSTOM_PLAY_BUCKET_KEY,
  };
}

export type ContentListState = ReturnType<typeof useContentListState>;
