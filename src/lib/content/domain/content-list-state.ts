import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT_DIR, type ContentListProps, type SortField } from "@/lib/content/domain/content-list";
import { DEFAULT_CONTENT_LIST_FILTERS, CUSTOM_PLAY_BUCKET_KEY, PLAY_BUCKETS, getSecondaryFilterSummary, parseContentListFilters, resolveEffectiveDates, writeContentListFilters, type ContentListFilterValue, type TimeRangePreset } from "@/app/(app)/admin/content/content-list-filters";
import { classifyVideoAnomalyBucket } from "@/lib/video-anomaly";

export function useContentListState(props: ContentListProps) {
  const {
    videos,
    profiles,
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
  const [metricViewMode, setMetricViewMode] = useState<"full" | "spacious">("spacious");
  const [filters, setFilters] = useState<ContentListFilterValue>(() =>
    parseContentListFilters(searchParams),
  );
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFiltersFromUrl = () => {
      setFilters(parseContentListFilters(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", syncFiltersFromUrl);
    return () => window.removeEventListener("popstate", syncFiltersFromUrl);
  }, []);

  const accountOptions = useMemo(() => {
    // gate:transient-map temporary call-local projection
    const byId = new Map<string, string>();
    for (const video of videos) {
      if (video.account_id && video.accounts?.name) byId.set(video.account_id, video.accounts.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [videos]);

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
    const nextParams = writeContentListFilters(new URLSearchParams(window.location.search), nextFilters);
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [filters]);

  /** 流量档位或组合条件需要一次改多个字段，沿用同一份 URL 同步与滚动复位 */
  const applyFilterPatch = useCallback((patch: Partial<ContentListFilterValue>) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    setCurrentPage(1);
    const nextParams = writeContentListFilters(new URLSearchParams(window.location.search), nextFilters);
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

  const handleClearSecondaryFilters = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    applyFilterPatch({
      accountId: "",
      playBucket: "",
      playMin: "",
      playMax: "",
      qualityGrade: "all",
      topicStatus: "all",
    });
  }, [applyFilterPatch]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_CONTENT_LIST_FILTERS);
    setCurrentPage(1);
    const nextParams = writeContentListFilters(new URLSearchParams(window.location.search), DEFAULT_CONTENT_LIST_FILTERS);
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
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_SORT_DIR[field]);
    }
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [sortField]);
  const hasActiveFilters =
    Object.entries(filters).some(([k, v]) => {
      if (k === "qualityGrade" || k === "topicStatus" || k === "timeRange") return v !== "all";
      if (k === "onlyAnomaly") return v === true;
      return Boolean(v);
    });
  const emptyTitle = hasActiveFilters
    ? "当前筛选条件下没有视频"
    : view === "trash"
      ? "暂无归档视频"
      : "暂无视频";
  const emptyDescription = hasActiveFilters
    ? "请调整筛选条件，或点击“重置”查看全部视频"
    : view === "trash"
      ? "已归档的视频会显示在这里"
      : "当前范围内还没有可查看的视频";

  const profileLabel = filters.userId
    ? profiles.find((profile) => profile.id === filters.userId)?.name ?? "人员"
    : "人员";
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
        return "综合优";
      case "good":
        return "综合良";
      case "fair":
        return "综合普";
      case "poor":
        return "综合劣";
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
        return "时间";
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
    sortField,
    sortDir,
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
