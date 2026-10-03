import type {
  ActiveTopicsResponse,
  TopicMoreFiltersState,
  TopicOption,
  TopicPoolItem,
  TopicPoolView,
  TopicTimeRange,
} from "../types";
import { TopicPoolExplorer } from "../TopicPoolExplorer";
import { TeamActivitySection } from "../TeamActivitySection";
import type { SortByOption } from "@/lib/topics/domain/pool-view";

export function TopicHubContent({
  activeTopics,
  activeLoading,
  activeError,
  fetchActiveData,
  resolvedPoolItems,
  topicsOptions,
  poolLoading,
  setPoolLoading,
  poolError,
  poolTotalCount,
  poolSearchQuery,
  poolPage,
  poolView,
  poolTimeRange,
  selectedTopicIds,
  moreFilters,
  sortBy,
  setIsCreateModalOpen,
  beginPoolQueryChange,
  setPoolPage,
  setPoolView,
  setPoolTimeRange,
  setSelectedTopicIds,
  setMoreFilters,
  setIsMoreFiltersOpen,
  setSortBy,
  debouncedPoolSearchQuery,
  setPoolSearchQuery,
  refreshAll,
  handleGoToFeishu,
  setInspectTopicId,
}: {
  activeTopics: ActiveTopicsResponse | null;
  activeLoading: boolean;
  activeError: string | null;
  fetchActiveData: () => Promise<void>;
  resolvedPoolItems: TopicPoolItem[];
  topicsOptions: TopicOption[];
  poolLoading: boolean;
  setPoolLoading: (loading: boolean) => void;
  poolError: string | null;
  poolTotalCount: number;
  poolSearchQuery: string;
  poolPage: number;
  poolView: TopicPoolView;
  poolTimeRange: TopicTimeRange;
  selectedTopicIds: string[];
  moreFilters: TopicMoreFiltersState;
  sortBy: SortByOption;
  setIsCreateModalOpen: (open: boolean) => void;
  beginPoolQueryChange: () => void;
  setPoolPage: (page: number) => void;
  setPoolView: (view: TopicPoolView) => void;
  setPoolTimeRange: (range: TopicTimeRange) => void;
  setSelectedTopicIds: (ids: string[]) => void;
  setMoreFilters: (filters: TopicMoreFiltersState) => void;
  setIsMoreFiltersOpen: (open: boolean) => void;
  setSortBy: (sortBy: SortByOption) => void;
  debouncedPoolSearchQuery: string;
  setPoolSearchQuery: (query: string) => void;
  refreshAll: () => Promise<void>;
  handleGoToFeishu: (topic: TopicPoolItem) => Promise<void>;
  setInspectTopicId: (topicId: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* 顶部大盘动态看板 */}
      <TeamActivitySection
        data={activeTopics}
        loading={activeLoading}
        error={activeError}
        onRetry={fetchActiveData}
        onSelectTopic={(topicId) => {
          setInspectTopicId(topicId);
        }}
      />

      {/* 选题库大盘主体 */}
      <TopicPoolExplorer
        items={resolvedPoolItems}
        topics={topicsOptions}
        loading={poolLoading}
        error={poolError}
        totalCount={poolTotalCount}
        searchQuery={poolSearchQuery}
        currentPage={poolPage}
        currentView={poolView}
        currentTimeRange={poolTimeRange}
        selectedTopicIds={selectedTopicIds}
        moreFilters={moreFilters}
        sortBy={sortBy}
        onCreateClick={() => setIsCreateModalOpen(true)}
        onPageChange={(p) => {
          beginPoolQueryChange();
          setPoolPage(p);
        }}
        onViewChange={(v) => {
          beginPoolQueryChange();
          setPoolPage(1);
          setPoolView(v);
        }}
        onTimeRangeChange={(t) => {
          beginPoolQueryChange();
          setPoolPage(1);
          setPoolTimeRange(t);
        }}
        onTopicIdsChange={(ids) => {
          beginPoolQueryChange();
          setPoolPage(1);
          setSelectedTopicIds(ids);
        }}
        onMoreFiltersChange={(f) => {
          beginPoolQueryChange();
          setPoolPage(1);
          setMoreFilters(f);
        }}
        onOpenMoreFilters={() => setIsMoreFiltersOpen(true)}
        onSortByChange={(s) => {
          beginPoolQueryChange();
          setPoolPage(1);
          setSortBy(s);
        }}
        onSearchQueryChange={(q) => {
          if (q.trim() !== debouncedPoolSearchQuery) beginPoolQueryChange();
          else setPoolLoading(false);
          setPoolSearchQuery(q);
        }}
        onRetry={() => void refreshAll()}
        onGoToFeishu={(topic) => void handleGoToFeishu(topic)}
        onSelectTopic={(subTopicId) => setInspectTopicId(subTopicId)}
      />
    </div>
  );
}
