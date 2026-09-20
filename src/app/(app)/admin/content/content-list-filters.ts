export interface ContentListFilterValue {
  userId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  keyword: string;
}

export const DEFAULT_CONTENT_LIST_FILTERS: ContentListFilterValue = {
  userId: "",
  accountId: "",
  startDate: "",
  endDate: "",
  keyword: "",
};

type FilterableContentVideo = {
  user_id: string;
  account_id: string;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
};

export function filterContentVideos<T extends FilterableContentVideo>(
  videos: T[],
  filters: ContentListFilterValue,
): T[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-CN");

  return videos.filter((video) => {
    if (filters.userId && video.user_id !== filters.userId) return false;
    if (filters.accountId && video.account_id !== filters.accountId) return false;

    const publishedDate = video.published_at?.slice(0, 10) ?? "";
    if (filters.startDate && (!publishedDate || publishedDate < filters.startDate)) return false;
    if (filters.endDate && (!publishedDate || publishedDate > filters.endDate)) return false;

    if (keyword) {
      const searchableText = `${video.video_title ?? ""}\n${video.content ?? ""}`.toLocaleLowerCase("zh-CN");
      if (!searchableText.includes(keyword)) return false;
    }

    return true;
  });
}

export function parseContentListFilters(params: Pick<URLSearchParams, "get">): ContentListFilterValue {
  return {
    userId: params.get("userId") ?? "",
    accountId: params.get("accountId") ?? "",
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    keyword: params.get("keyword") ?? "",
  };
}

export function writeContentListFilters(
  currentParams: URLSearchParams,
  filters: ContentListFilterValue,
): URLSearchParams {
  const next = new URLSearchParams(currentParams);
  const entries = Object.entries(filters) as Array<[keyof ContentListFilterValue, string]>;
  for (const [key, value] of entries) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}
