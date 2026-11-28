export type TopicPoolQueryState = {
  view: string;
  sort: string;
  search: string;
  timeRange: string;
  topicIds: string[];
  sourceType: string;
  recentHeat: string;
  durationRange: string;
  performance: string;
  pageSize: number;
};

export function buildTopicPoolQuery(state: TopicPoolQueryState, page: number) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(state.pageSize));
  if (state.view !== "all") params.set("view", state.view);
  if (state.sort !== "latest") params.set("sort", state.sort);
  const search = state.search.trim();
  if (search) params.set("q", search);
  if (state.timeRange !== "all") params.set("time_range", state.timeRange);
  for (const topicId of state.topicIds) params.append("topic_id", topicId);
  if (state.sourceType !== "all") params.set("source_type", state.sourceType);
  if (state.recentHeat !== "all") params.set("recent_heat", state.recentHeat);
  if (state.durationRange !== "all") params.set("duration_range", state.durationRange);
  if (state.performance !== "all") params.set("performance", state.performance);
  return params;
}

export function createTopicPoolRequestCoordinator<T>(
  request: (page: number, signal: AbortSignal) => Promise<T>,
) {
  let requestId = 0;
  let controller: AbortController | null = null;

  return {
    async load(page: number): Promise<{ accepted: true; value: T } | { accepted: false }> {
      const id = ++requestId;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const value = await request(page, signal);
        if (signal.aborted || id !== requestId) return { accepted: false };
        return { accepted: true, value };
      } catch (error) {
        if (signal.aborted || id !== requestId) return { accepted: false };
        throw error;
      }
    },
    invalidate() {
      requestId += 1;
      controller?.abort();
      controller = null;
    },
  };
}
