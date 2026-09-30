import type {
  ContentQualityGradeFilter,
  WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";

export interface ContentListFilterValue {
  userId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  keyword: string;
  /** 流量档位（24h 播放量分档）："" / lt2k / 2k-5k / 5k-2w / 2w-5w / ge5w / custom */
  playBucket: string;
  /** 仅当 playBucket === "custom" 时生效，闭区间下界（含） */
  playMin: string;
  /** 仅当 playBucket === "custom" 时生效，开区间上界（不含） */
  playMax: string;
  /** 综合评级筛选：all / excellent / good / fair / poor / unrated */
  qualityGrade: ContentQualityGradeFilter;
}

export const DEFAULT_CONTENT_LIST_FILTERS: ContentListFilterValue = {
  userId: "",
  accountId: "",
  startDate: "",
  endDate: "",
  keyword: "",
  playBucket: "",
  playMin: "",
  playMax: "",
  qualityGrade: "all",
};

/** 流量分档阈值（24h 播放量），由阿禅 2026-09-28 定：
 *  2000 / 5000 / 20000 / 50000 五档，另加自定义区间。
 *  min 含、max 不含；最后一档 max = null（无上界）。 */
export const PLAY_BUCKETS = [
  { key: "lt2k", label: "<2千", min: 0, max: 2000 },
  { key: "2k-5k", label: "2千-5千", min: 2000, max: 5000 },
  { key: "5k-2w", label: "5千-2万", min: 5000, max: 20000 },
  { key: "2w-5w", label: "2万-5万", min: 20000, max: 50000 },
  { key: "ge5w", label: "≥5万", min: 50000, max: null },
] as const;

export const CUSTOM_PLAY_BUCKET_KEY = "custom";

type FilterableContentVideo = {
  id: string;
  user_id: string;
  account_id: string;
  accounts?: { profile_id?: string | null } | null;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
};

/** 从 filters 解析出当前生效的播放量区间；无生效筛选返回 null。
 *  自定义档位：min/max 都空 → 不筛；单边填 → 按单边处理。 */
function resolvePlayRange(
  filters: ContentListFilterValue,
): { min: number | null; max: number | null } | null {
  if (!filters.playBucket) return null;
  if (filters.playBucket === CUSTOM_PLAY_BUCKET_KEY) {
    const min = filters.playMin ? Number(filters.playMin) : null;
    const max = filters.playMax ? Number(filters.playMax) : null;
    if (min === null && max === null) return null;
    if (Number.isNaN(min) || Number.isNaN(max)) return null;
    return { min, max };
  }
  const bucket = PLAY_BUCKETS.find((item) => item.key === filters.playBucket);
  if (!bucket) return null;
  return { min: bucket.min, max: bucket.max };
}

export function filterContentVideos<T extends FilterableContentVideo>(
  videos: T[],
  filters: ContentListFilterValue,
  playCountById?: Map<string, number | null>,
  contentQualityByVideoId?: Record<string, WorkContentQuality> | Map<string, WorkContentQuality>,
): T[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-CN");
  const playRange = resolvePlayRange(filters);

  return videos.filter((video) => {
    const ownerUserId = video.accounts?.profile_id ?? video.user_id;
    if (filters.userId && ownerUserId !== filters.userId) return false;
    if (filters.accountId && video.account_id !== filters.accountId) return false;

    const publishedDate = video.published_at?.slice(0, 10) ?? "";
    if (filters.startDate && (!publishedDate || publishedDate < filters.startDate)) return false;
    if (filters.endDate && (!publishedDate || publishedDate > filters.endDate)) return false;

    if (keyword) {
      const searchableText = `${video.video_title ?? ""}\n${video.content ?? ""}`.toLocaleLowerCase("zh-CN");
      if (!searchableText.includes(keyword)) return false;
    }

    if (playRange) {
      // 没有 24h 快照 = 播放量未知；一旦启用流量筛选就把未知排除，
      // 否则会在"<2千"这类低档里混入「其实还没数据」的稿子，产生误判。
      const playCount = playCountById?.get(video.id) ?? null;
      if (playCount === null || playCount === undefined) return false;
      if (playRange.min !== null && playCount < playRange.min) return false;
      if (playRange.max !== null && playCount >= playRange.max) return false;
    }

    if (filters.qualityGrade && filters.qualityGrade !== "all") {
      const quality = contentQualityByVideoId instanceof Map
        ? contentQualityByVideoId.get(video.id)
        : contentQualityByVideoId?.[video.id];

      // 主方案 §7: unlinked 显示未关联，不参与评级筛选命中
      if (!quality || quality.status === "unlinked") return false;

      if (filters.qualityGrade === "excellent") {
        if (quality.overallGrade !== "优") return false;
      } else if (filters.qualityGrade === "good") {
        if (quality.overallGrade !== "良") return false;
      } else if (filters.qualityGrade === "fair") {
        if (quality.overallGrade !== "普") return false;
      } else if (filters.qualityGrade === "poor") {
        if (quality.overallGrade !== "劣") return false;
      } else if (filters.qualityGrade === "unrated") {
        if (quality.overallGrade !== null) return false;
      }
    }

    return true;
  });
}

export function parseContentListFilters(params: Pick<URLSearchParams, "get">): ContentListFilterValue {
  const rawGrade = params.get("qualityGrade");
  const qualityGrade: ContentQualityGradeFilter =
    rawGrade === "excellent" ||
    rawGrade === "good" ||
    rawGrade === "fair" ||
    rawGrade === "poor" ||
    rawGrade === "unrated"
      ? rawGrade
      : "all";

  return {
    userId: params.get("userId") ?? "",
    accountId: params.get("accountId") ?? "",
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    keyword: params.get("keyword") ?? "",
    playBucket: params.get("playBucket") ?? "",
    playMin: params.get("playMin") ?? "",
    playMax: params.get("playMax") ?? "",
    qualityGrade,
  };
}

export function writeContentListFilters(
  currentParams: URLSearchParams,
  filters: ContentListFilterValue,
): URLSearchParams {
  const next = new URLSearchParams(currentParams);
  const entries = Object.entries(filters) as Array<[keyof ContentListFilterValue, string]>;
  for (const [key, value] of entries) {
    if (key === "qualityGrade") {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    } else {
      if (value) next.set(key, value);
      else next.delete(key);
    }
  }
  return next;
}
