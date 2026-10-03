import type {
  TopicPoolItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
  TopicMoreFiltersState,
} from "@/components/topics-v2/types";
import { DEFAULT_MORE_FILTERS } from "@/components/topics-v2/types";

export type SortByOption =
  | "latest"
  | "avg_play"
  | "best_play"
  | "recent_heat";

export interface TopicPoolExplorerProps {
  items: TopicPoolItem[];
  topics: TopicOption[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  searchQuery: string;
  currentPage: number;
  currentView: TopicPoolView;
  currentTimeRange: TopicTimeRange;
  selectedTopicIds: string[];
  moreFilters: TopicMoreFiltersState;
  sortBy: SortByOption;
  onPageChange: (page: number) => void;
  onViewChange: (view: TopicPoolView) => void;
  onTimeRangeChange: (timeRange: TopicTimeRange) => void;
  onTopicIdsChange: (topicIds: string[]) => void;
  onMoreFiltersChange: (filters: TopicMoreFiltersState) => void;
  onOpenMoreFilters: () => void;
  onSortByChange: (sortBy: SortByOption) => void;
  onSearchQueryChange: (query: string) => void;
  onRetry: () => void;
  onGoToFeishu: (topic: TopicPoolItem) => void;
  onSelectTopic: (subTopicId: string) => void;
  onCreateClick?: () => void;
}

export const getSortByLabel = (sortBy: SortByOption) =>
  sortBy === "best_play"
    ? "最高播放"
    : sortBy === "avg_play"
      ? "均播"
      : sortBy === "recent_heat"
        ? "7天热度"
        : "最新";

export const getTimeRangeLabel = (range: TopicTimeRange) => {
  switch (range) {
    case "3d":
      return "近 3 天";
    case "1w":
      return "近 7 天";
    case "1m":
      return "近 30 天";
    case "3m":
      return "近 90 天";
    case "all":
    default:
      return "全部时间";
  }
};

export const sourceTypeLabel = (v: TopicMoreFiltersState["sourceType"]) =>
  v === "internal" ? "内部来源" : v === "external" ? "外部来源" : "";
export const recentHeatLabel = (v: TopicMoreFiltersState["recentHeat"]) =>
  v === "has_participants" ? "近7天有参与" : v === "has_completed" ? "近7天有完成" : v === "has_in_progress" ? "近7天有在写" : v === "no_participants" ? "近7天暂无参与" : "";
export const durationLabel = (v: TopicMoreFiltersState["durationRange"]) =>
  v === "under_2m" ? "2分钟内" : v === "2_5m" ? "2-5分钟" : v === "over_5m" ? "5分钟以上" : "";
export const performanceLabel = (v: TopicMoreFiltersState["performanceTier"]) =>
  v === "high_best_play" ? "最高播放≥10万" : v === "high_qualified" ? "有达标作品" : v === "high_avg_play" ? "均播≥3万" : "";

export function hasRealActiveFilters(
  currentTimeRange: TopicTimeRange,
  searchQuery: string,
  moreFilters: TopicMoreFiltersState,
) {
  return (
    currentTimeRange !== "all" ||
    searchQuery.trim().length > 0 ||
    moreFilters.sourceType !== "all" ||
    moreFilters.recentHeat !== "all" ||
    moreFilters.durationRange !== "all" ||
    moreFilters.performanceTier !== "all"
  );
}

export { DEFAULT_MORE_FILTERS };
