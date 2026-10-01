import type {
  ContentQualityGradeFilter,
  WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";
import { classifyVideoAnomalyBucket } from "@/lib/video-anomaly";

export type TimeRangePreset = "all" | "yesterday" | "7d" | "30d" | "thisMonth" | "custom";
export type TopicStatusFilter = "all" | "in_library" | "removed";

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
  /** 快速开关：只看待处理异常 */
  onlyAnomaly: boolean;
  /** 时间切片预设 */
  timeRange: TimeRangePreset;
  /** 选题库状态 */
  topicStatus: TopicStatusFilter;
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
  onlyAnomaly: false,
  timeRange: "all",
  topicStatus: "all",
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

export function getShanghaiDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getShanghaiDateOffset(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return getShanghaiDateString(target);
}

export function resolveEffectiveDates(filters: Pick<ContentListFilterValue, "timeRange" | "startDate" | "endDate">): {
  effectiveStartDate: string;
  effectiveEndDate: string;
} {
  if (filters.timeRange === "yesterday") {
    const yesterday = getShanghaiDateOffset(-1);
    return { effectiveStartDate: yesterday, effectiveEndDate: yesterday };
  }
  if (filters.timeRange === "7d") {
    return { effectiveStartDate: getShanghaiDateOffset(-6), effectiveEndDate: getShanghaiDateString() };
  }
  if (filters.timeRange === "30d") {
    return { effectiveStartDate: getShanghaiDateOffset(-29), effectiveEndDate: getShanghaiDateString() };
  }
  if (filters.timeRange === "thisMonth") {
    const today = getShanghaiDateString();
    return { effectiveStartDate: `${today.slice(0, 7)}-01`, effectiveEndDate: today };
  }
  // custom 或直接传了 startDate/endDate
  return { effectiveStartDate: filters.startDate || "", effectiveEndDate: filters.endDate || "" };
}

type FilterableContentVideo = {
  id: string;
  user_id: string;
  account_id: string;
  accounts?: { profile_id?: string | null } | null;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
  anomaly_status?: string | null;
  play_change_signal?: string | null;
  topic_library_status?: string | null;
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
  const { effectiveStartDate, effectiveEndDate } = resolveEffectiveDates(filters);

  return videos.filter((video) => {
    const ownerUserId = video.accounts?.profile_id ?? video.user_id;
    if (filters.userId && ownerUserId !== filters.userId) return false;
    if (filters.accountId && video.account_id !== filters.accountId) return false;

    const publishedDate = video.published_at?.slice(0, 10) ?? "";
    if (effectiveStartDate && (!publishedDate || publishedDate < effectiveStartDate)) return false;
    if (effectiveEndDate && (!publishedDate || publishedDate > effectiveEndDate)) return false;

    if (filters.onlyAnomaly) {
      if (classifyVideoAnomalyBucket(video) === null) return false;
    }

    if (filters.topicStatus && filters.topicStatus !== "all") {
      const status = video.topic_library_status ?? null;
      if (filters.topicStatus === "in_library" && status !== "in_library") return false;
      if (filters.topicStatus === "removed" && status !== "removed") return false;
    }

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

  const anomalyParam = params.get("anomaly") || params.get("onlyAnomaly");
  const onlyAnomaly = anomalyParam === "1" || anomalyParam === "true";

  const rawTopic = params.get("topicStatus");
  const topicStatus: TopicStatusFilter =
    rawTopic === "in_library" || rawTopic === "removed" ? rawTopic : "all";

  const rawTimeRange = params.get("timeRange");
  const startDate = params.get("startDate") ?? "";
  const endDate = params.get("endDate") ?? "";

  let timeRange: TimeRangePreset = "all";
  if (
    rawTimeRange === "all" ||
    rawTimeRange === "yesterday" ||
    rawTimeRange === "7d" ||
    rawTimeRange === "30d" ||
    rawTimeRange === "thisMonth" ||
    rawTimeRange === "custom"
  ) {
    timeRange = rawTimeRange;
  } else if (startDate || endDate) {
    timeRange = "custom";
  }

  return {
    userId: params.get("userId") ?? "",
    accountId: params.get("accountId") ?? "",
    startDate,
    endDate,
    keyword: params.get("keyword") ?? "",
    playBucket: params.get("playBucket") ?? "",
    playMin: params.get("playMin") ?? "",
    playMax: params.get("playMax") ?? "",
    qualityGrade,
    onlyAnomaly,
    timeRange,
    topicStatus,
  };
}

export function writeContentListFilters(
  currentParams: URLSearchParams,
  filters: ContentListFilterValue,
): URLSearchParams {
  const next = new URLSearchParams(currentParams);

  if (filters.userId) next.set("userId", filters.userId);
  else next.delete("userId");

  if (filters.accountId) next.set("accountId", filters.accountId);
  else next.delete("accountId");

  if (filters.keyword) next.set("keyword", filters.keyword);
  else next.delete("keyword");

  if (filters.playBucket) next.set("playBucket", filters.playBucket);
  else next.delete("playBucket");

  if (filters.playBucket === CUSTOM_PLAY_BUCKET_KEY) {
    if (filters.playMin) next.set("playMin", filters.playMin);
    else next.delete("playMin");
    if (filters.playMax) next.set("playMax", filters.playMax);
    else next.delete("playMax");
  } else {
    next.delete("playMin");
    next.delete("playMax");
  }

  if (filters.qualityGrade && filters.qualityGrade !== "all") {
    next.set("qualityGrade", filters.qualityGrade);
  } else {
    next.delete("qualityGrade");
  }

  if (filters.onlyAnomaly) {
    next.set("anomaly", "1");
  } else {
    next.delete("anomaly");
    next.delete("onlyAnomaly");
  }

  if (filters.timeRange && filters.timeRange !== "all") {
    next.set("timeRange", filters.timeRange);
  } else {
    next.delete("timeRange");
  }

  if (filters.timeRange === "custom" || (!filters.timeRange && (filters.startDate || filters.endDate))) {
    if (filters.startDate) next.set("startDate", filters.startDate);
    else next.delete("startDate");
    if (filters.endDate) next.set("endDate", filters.endDate);
    else next.delete("endDate");
  } else {
    next.delete("startDate");
    next.delete("endDate");
  }

  if (filters.topicStatus && filters.topicStatus !== "all") {
    next.set("topicStatus", filters.topicStatus);
  } else {
    next.delete("topicStatus");
  }

  return next;
}

export interface SecondaryFilterSummary {
  count: number;
  label: string;
  fullDescription: string;
  isActive: boolean;
}

export function getSecondaryFilterSummary(
  filters: ContentListFilterValue,
  accountMap?: Map<string, string> | Record<string, string>,
): SecondaryFilterSummary {
  const parts: string[] = [];

  if (filters.topicStatus === "in_library") {
    parts.push("已入库");
  } else if (filters.topicStatus === "removed") {
    parts.push("已移出");
  }

  if (filters.accountId) {
    const name = accountMap instanceof Map
      ? accountMap.get(filters.accountId)
      : accountMap?.[filters.accountId];
    parts.push(name ? name : "指定账号");
  }

  if (filters.playBucket) {
    if (filters.playBucket === CUSTOM_PLAY_BUCKET_KEY) {
      if (filters.playMin && filters.playMax) {
        parts.push(`流量 ${filters.playMin}-${filters.playMax}`);
      } else if (filters.playMin) {
        parts.push(`流量 ≥ ${filters.playMin}`);
      } else if (filters.playMax) {
        parts.push(`流量 < ${filters.playMax}`);
      } else {
        parts.push("自定义流量");
      }
    } else {
      const bucket = PLAY_BUCKETS.find((b) => b.key === filters.playBucket);
      if (bucket) parts.push(bucket.label);
    }
  }

  if (filters.qualityGrade && filters.qualityGrade !== "all") {
    switch (filters.qualityGrade) {
      case "excellent":
        parts.push("综合优");
        break;
      case "good":
        parts.push("综合良");
        break;
      case "fair":
        parts.push("综合普");
        break;
      case "poor":
        parts.push("综合劣");
        break;
      case "unrated":
        parts.push("未评级");
        break;
    }
  }

  const count = parts.length;
  if (count === 0) {
    return {
      count: 0,
      label: "筛选",
      fullDescription: "无筛选条件",
      isActive: false,
    };
  }

  let label = parts.slice(0, 2).join(" · ");
  if (count > 2) {
    label += ` +${count - 2}`;
  }

  return {
    count,
    label,
    fullDescription: parts.join(" · "),
    isActive: true,
  };
}
