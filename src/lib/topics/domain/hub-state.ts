import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveTopicsResponse,
  TopicPoolItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
  TopicMoreFiltersState,
} from "@/components/topics-v2/types";
import { DEFAULT_MORE_FILTERS } from "@/components/topics-v2/types";
import type { V2TopicLibraryBootstrap } from "@/lib/topics/v2-client-contract";
import { isTopicWritingByCurrentUser } from "@/components/topics-v2/topic-writing-state";
import type { SortByOption } from "./pool-view";

export function useTopicHubState(
  initialBootstrapData: V2TopicLibraryBootstrap | null,
  initialTopicId: string | null,
) {
  // 全局数据状态
  const [activeTopics, setActiveTopics] = useState<ActiveTopicsResponse | null>(
    () => (initialBootstrapData?.active as unknown as ActiveTopicsResponse | undefined) ?? null,
  );
  const [activeLoading, setActiveLoading] = useState(!initialBootstrapData);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [poolItems, setPoolItems] = useState<TopicPoolItem[]>(
    () => (initialBootstrapData?.pool.items as unknown as TopicPoolItem[] | undefined) ?? [],
  );
  const [poolLoading, setPoolLoading] = useState(!initialBootstrapData);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolTotalCount, setPoolTotalCount] = useState(
    () => initialBootstrapData?.pool.pagination.totalItems ?? 0,
  );

  const [topicsOptions, setTopicsOptions] = useState<TopicOption[]>(
    () => (initialBootstrapData?.options as unknown as TopicOption[] | undefined) ?? [],
  );
  const [topicsOptionsError, setTopicsOptionsError] = useState<string | null>(null);

  // 选题池 Query & 排序筛选选项
  const [poolView, setPoolView] = useState<TopicPoolView>("all");
  const [poolTimeRange, setPoolTimeRange] = useState<TopicTimeRange>("all");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [moreFilters, setMoreFilters] =
    useState<TopicMoreFiltersState>(DEFAULT_MORE_FILTERS);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortByOption>("latest");
  const [poolSearchQuery, setPoolSearchQuery] = useState("");
  const [debouncedPoolSearchQuery, setDebouncedPoolSearchQuery] = useState("");
  const [poolPage, setPoolPage] = useState(1);

  // 抽屉与 Modal 控制；深链 topic_id 直接打开对应抽屉
  const [inspectTopicId, setInspectTopicId] = useState<string | null>(initialTopicId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 服务端 bootstrap 下发的当前登录用户 ID（抽屉用于仅作者可见的编辑/移出）
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    () => initialBootstrapData?.currentUserId ?? null,
  );

  const [, setAuthError] = useState(false);
  const [membershipRequired, setMembershipRequired] = useState(false);
  const poolRequestId = useRef(0);
  const poolAbortController = useRef<AbortController | null>(null);
  const skipPoolEffectPage = useRef<number | null>(null);
  const [writingTopicIds, setWritingTopicIds] = useState<Set<string>>(
    () => new Set(initialBootstrapData?.myWritingTopicIds ?? []),
  );
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);
  const previousPoolQueryKey = useRef<string | null>(null);

  const resolvedPoolItems = useMemo(
    () =>
      poolItems.map((item) => ({
        ...item,
        isWritingByMe: isTopicWritingByCurrentUser(item, writingTopicIds),
      })),
    [poolItems, writingTopicIds],
  );

  const beginPoolQueryChange = useCallback(() => {
    poolAbortController.current?.abort();
    poolRequestId.current += 1;
    setPoolLoading(true);
    setPoolError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPoolPage(1);
      setDebouncedPoolSearchQuery(poolSearchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [poolSearchQuery]);

  const poolQueryKey = [
    poolPage,
    poolView,
    sortBy,
    debouncedPoolSearchQuery,
    poolTimeRange,
    selectedTopicIds.join(","),
    moreFilters.sourceType,
    moreFilters.recentHeat,
    moreFilters.durationRange,
    moreFilters.performanceTier,
  ].join("|");

  return {
    activeTopics,
    setActiveTopics,
    activeLoading,
    setActiveLoading,
    activeError,
    setActiveError,
    poolItems,
    setPoolItems,
    poolLoading,
    setPoolLoading,
    poolError,
    setPoolError,
    poolTotalCount,
    setPoolTotalCount,
    topicsOptions,
    setTopicsOptions,
    topicsOptionsError,
    setTopicsOptionsError,
    poolView,
    setPoolView,
    poolTimeRange,
    setPoolTimeRange,
    selectedTopicIds,
    setSelectedTopicIds,
    moreFilters,
    setMoreFilters,
    isMoreFiltersOpen,
    setIsMoreFiltersOpen,
    sortBy,
    setSortBy,
    poolSearchQuery,
    setPoolSearchQuery,
    debouncedPoolSearchQuery,
    poolPage,
    setPoolPage,
    inspectTopicId,
    setInspectTopicId,
    isCreateModalOpen,
    setIsCreateModalOpen,
    currentUserId,
    setCurrentUserId,
    setAuthError,
    membershipRequired,
    setMembershipRequired,
    poolRequestId,
    poolAbortController,
    skipPoolEffectPage,
    writingTopicIds,
    setWritingTopicIds,
    bootstrapRequestRef,
    previousPoolQueryKey,
    resolvedPoolItems,
    beginPoolQueryChange,
    poolQueryKey,
  };
}

type TopicHubState = ReturnType<typeof useTopicHubState>;

type TopicHubNavigationOptions = {
  inspectTopicId: TopicHubState["inspectTopicId"];
  poolItems: TopicHubState["poolItems"];
  poolPage: TopicHubState["poolPage"];
  poolTotalCount: TopicHubState["poolTotalCount"];
  setInspectTopicId: TopicHubState["setInspectTopicId"];
  setPoolPage: TopicHubState["setPoolPage"];
  skipPoolEffectPageRef: TopicHubState["skipPoolEffectPage"];
  fetchPoolPage: (targetPage: number) => Promise<{ items: TopicPoolItem[] } | null>;
  showToast: (text: string, type?: "success" | "error") => void;
};

export function useTopicHubNavigation({
  inspectTopicId,
  poolItems,
  poolPage,
  poolTotalCount,
  setInspectTopicId,
  setPoolPage,
  skipPoolEffectPageRef,
  fetchPoolPage,
  showToast,
}: TopicHubNavigationOptions) {
  const currentInspectIndex = inspectTopicId
    ? poolItems.findIndex((item) => item.id === inspectTopicId)
    : -1;
  const totalPages = Math.max(1, Math.ceil(poolTotalCount / 50));
  const hasPrevTopic = currentInspectIndex > 0 || poolPage > 1;
  const hasNextTopic =
    (currentInspectIndex >= 0 && currentInspectIndex < poolItems.length - 1) ||
    poolPage < totalPages;

  const handleNavigateTopic = useCallback(
    async (direction: "prev" | "next") => {
      if (!inspectTopicId) return;
      const currentIndex = poolItems.findIndex((item) => item.id === inspectTopicId);
      if (currentIndex < 0) return;

      if (direction === "next") {
        if (currentIndex < poolItems.length - 1) {
          setInspectTopicId(poolItems[currentIndex + 1].id);
        } else if (poolPage < totalPages) {
          // 当前页扫到底部，跨页拉取下一页首条
          const nextPage = poolPage + 1;
          try {
            const parsed = await fetchPoolPage(nextPage);
            if (!parsed) return;
            skipPoolEffectPageRef.current = nextPage;
            setPoolPage(nextPage);
            if (parsed.items.length > 0) {
              setInspectTopicId(parsed.items[0].id);
            }
          } catch {
            showToast("加载下一页选题失败", "error");
          }
        }
      } else {
        if (currentIndex > 0) {
          setInspectTopicId(poolItems[currentIndex - 1].id);
        } else if (poolPage > 1) {
          // 当前页扫到顶部，跨页拉取上一页末条
          const prevPage = poolPage - 1;
          try {
            const parsed = await fetchPoolPage(prevPage);
            if (!parsed) return;
            skipPoolEffectPageRef.current = prevPage;
            setPoolPage(prevPage);
            if (parsed.items.length > 0) {
              setInspectTopicId(parsed.items[parsed.items.length - 1].id);
            }
          } catch {
            showToast("加载上一页选题失败", "error");
          }
        }
      }
    },
    [
      fetchPoolPage,
      inspectTopicId,
      poolItems,
      poolPage,
      setInspectTopicId,
      setPoolPage,
      showToast,
      skipPoolEffectPageRef,
      totalPages,
    ],
  );

  return {
    currentInspectIndex,
    totalPages,
    hasPrevTopic,
    hasNextTopic,
    handleNavigateTopic,
  };
}
