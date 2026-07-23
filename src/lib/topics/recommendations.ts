import type { SupabaseClient } from "@supabase/supabase-js";

import { getDateDaysAgo } from "@/app/(app)/content-tools/utils";
import type { TopicSuggestionItem } from "@/app/(app)/content-tools/types";
import { parseTopicSuggestions } from "@/app/api/content-tools/helpers";
import { callAiJson } from "@/lib/ai/client";
import { breakoutCoefficient, getAccountBaseline } from "@/lib/video-metrics";

type VideoRow = {
  id: string;
  account_id: string | null;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
  accounts?: { name: string; content_direction?: string | null } | { name: string; content_direction?: string | null }[] | null;
};

type SnapshotRow = { video_id: string; play_count: number };
type TagRow = { video_id: string; tag_dimension: string; tag_value: string };
type MarketContext = { context_date: string; market_change: number | null; market_sentiment: string | null; hot_sectors: string[] | null };
type BreakoutSample = {
  videoId: string;
  title: string | null;
  accountId: string | null;
  accountName: string | null;
  contentDirection: string | null;
  playCount24h: number;
  breakoutValue: number;
  tags: TagRow[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TopicRecommendationResult = {
  suggestions: TopicSuggestionItem[];
  evidenceSummary: string[];
  sampleCount: number;
  marketDate: string | null;
};

function accountMeta(accounts: VideoRow["accounts"]) {
  const account = Array.isArray(accounts) ? accounts[0] : accounts;
  return { name: account?.name ?? null, contentDirection: account?.content_direction ?? null };
}

function buildTopicPrompt(samples: BreakoutSample[], market: MarketContext | null, limit: number) {
  const evidence = samples.slice(0, 8).map((sample) => ({
    title: sample.title,
    accountName: sample.accountName,
    contentDirection: sample.contentDirection,
    playCount24h: sample.playCount24h,
    breakoutCoefficient: Number(sample.breakoutValue.toFixed(2)),
    tags: sample.tags.map((tag) => `${tag.tag_dimension}:${tag.tag_value}`),
  }));

  return [
    "你是抖音金融内容选题策划。",
    "任务：结合近期爆款视频标签分布和市场热点，输出 3-5 个短视频选题。",
    "只输出 JSON，不要 Markdown，不要代码块，不要额外解释。",
    '{"suggestions":[{"title":"...","category":"...","angle":"...","expectedPerformance":"...","evidence":"...","referenceVideos":[{"videoId":"...","title":"...","accountName":"...","playCount24h":12345,"breakoutCoefficient":2.1}]}]}',
    "要求：1. 选题可直接拍。2. category 填题材，angle 填切入角度。3. expectedPerformance 用相对描述。4. evidence 必须引用样本分布或市场热点。",
    `建议数量：${limit}`,
    `最新市场环境：${market ? JSON.stringify({ date: market.context_date, sentiment: market.market_sentiment, hotSectors: market.hot_sectors, marketChange: market.market_change }) : "无"}`,
    "爆款样本：",
    JSON.stringify(evidence, null, 2),
  ].join("\n");
}

export function buildTopicRecommendationQueryOptions(searchParams: URLSearchParams) {
  const rawDays = searchParams.get("days");
  const days = rawDays === null ? 14 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { ok: false as const, status: 400, message: "days 必须是 1 到 90 之间的整数" };
  }

  const accountId = searchParams.get("accountId")?.trim() || null;
  if (accountId && !UUID_PATTERN.test(accountId)) {
    return { ok: false as const, status: 400, message: "accountId 格式不正确" };
  }

  return { ok: true as const, value: { days, accountId } };
}

export function buildLatestSnapshotMap(snapshots: SnapshotRow[]) {
  const latestSnapshots = new Map<string, SnapshotRow>();
  for (const snapshot of snapshots) {
    if (!latestSnapshots.has(snapshot.video_id)) latestSnapshots.set(snapshot.video_id, snapshot);
  }
  return latestSnapshots;
}

function calculateSamples(videos: VideoRow[], snapshots: SnapshotRow[], tagMap: Map<string, TagRow[]>) {
  const snapshotMap = buildLatestSnapshotMap(snapshots);
  const countsByAccount = videos.reduce<Map<string, number[]>>((map, video) => {
    const snapshot = snapshotMap.get(video.id);
    if (!video.account_id || !snapshot || snapshot.play_count <= 0) return map;
    map.set(video.account_id, [...(map.get(video.account_id) ?? []), snapshot.play_count]);
    return map;
  }, new Map());
  const teamMedian = getAccountBaseline(snapshots.filter((row) => row.play_count > 0).map((row) => row.play_count), null).median;

  return videos
    .map((video) => {
      const snapshot = snapshotMap.get(video.id);
      if (!snapshot || snapshot.play_count <= 0) return null;
      const meta = accountMeta(video.accounts);
      const baseline = video.account_id
        ? getAccountBaseline(countsByAccount.get(video.account_id) ?? [], teamMedian)
        : { median: teamMedian, strategy: "insufficient" as const };
      return {
        videoId: video.id,
        title: video.video_title,
        accountId: video.account_id,
        accountName: meta.name,
        contentDirection: meta.contentDirection,
        playCount24h: snapshot.play_count,
        breakoutValue: breakoutCoefficient(snapshot.play_count, baseline.median) ?? 0,
        tags: tagMap.get(video.id) ?? [],
      } satisfies BreakoutSample;
    })
    .filter((sample): sample is BreakoutSample => sample !== null)
    .sort((a, b) => b.playCount24h - a.playCount24h);
}

function buildEvidenceSummary(samples: BreakoutSample[], market: MarketContext | null) {
  const topicCounts = new Map<string, number>();
  for (const sample of samples) {
    for (const tag of sample.tags) {
      if (tag.tag_dimension === "题材") topicCounts.set(tag.tag_value, (topicCounts.get(tag.tag_value) ?? 0) + 1);
    }
  }
  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => `${tag} 标签在爆款样本中出现 ${count} 次`);
  const topSamples = samples.slice(0, 2).map((sample) => `${sample.accountName ?? "未知账号"}《${sample.title ?? "未命名视频"}》24h 播放 ${sample.playCount24h}`);
  return [...topTopics, ...topSamples, market?.hot_sectors?.length ? `最新热点板块：${market.hot_sectors.join("、")}` : "暂无市场热点板块数据"].slice(0, 4);
}

export async function generateTopicRecommendations(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[] | null;
  days: number;
  accountId?: string | null;
  limit?: number;
  dateColumn: "created_at" | "uploaded_at";
}): Promise<TopicRecommendationResult> {
  const today = new Date().toISOString().split("T")[0];
  const startAt = `${getDateDaysAgo(today, input.days)}T00:00:00.000Z`;
  if (input.visibleUserIds && input.visibleUserIds.length === 0) {
    return { suggestions: [], evidenceSummary: ["当前可见范围内暂无高播放样本。"], sampleCount: 0, marketDate: null };
  }

  let videosQuery = input.supabase
    .from("videos")
    .select("id, account_id, video_title, content, published_at, accounts(name, content_direction)")
    .eq("lifecycle_state", "active")
    .gte(input.dateColumn, startAt)
    .order("published_at", { ascending: false, nullsFirst: false });
  if (input.visibleUserIds) videosQuery = videosQuery.in("user_id", input.visibleUserIds);
  if (input.accountId) videosQuery = videosQuery.eq("account_id", input.accountId);
  const { data: videos, error: videosError } = await videosQuery;
  if (videosError) throw new Error(videosError.message);

  const videoRows = (videos ?? []) as VideoRow[];
  const videoIds = videoRows.map((video) => video.id);
  const [snapshotsResult, tagsResult, marketResult] = await Promise.all([
    videoIds.length
      ? input.supabase.from("video_metrics_snapshots").select("video_id, play_count").in("video_id", videoIds).eq("snapshot_type", "24h").order("captured_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    videoIds.length
      ? input.supabase.from("video_tags").select("video_id, tag_dimension, tag_value").in("video_id", videoIds)
      : Promise.resolve({ data: [], error: null }),
    input.supabase.from("market_context_daily").select("context_date, market_change, market_sentiment, hot_sectors").order("context_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (snapshotsResult.error) throw new Error(snapshotsResult.error.message);
  if (tagsResult.error) throw new Error(tagsResult.error.message);

  const tagMap = ((tagsResult.data ?? []) as TagRow[]).reduce<Map<string, TagRow[]>>((map, tag) => {
    map.set(tag.video_id, [...(map.get(tag.video_id) ?? []), tag]);
    return map;
  }, new Map());
  const market = (marketResult.data ?? null) as MarketContext | null;
  const breakoutSamples = calculateSamples(videoRows, (snapshotsResult.data ?? []) as SnapshotRow[], tagMap)
    .filter((sample) => sample.breakoutValue >= 1.2)
    .slice(0, 12);
  if (!breakoutSamples.length) {
    return {
      suggestions: [],
      evidenceSummary: ["当前时间范围内暂无高播放样本，建议扩大时间范围后重试。"],
      sampleCount: 0,
      marketDate: market?.context_date ?? null,
    };
  }

  const aiResult = await callAiJson(buildTopicPrompt(breakoutSamples, market, Math.min(input.limit ?? 4, 5)), {
    maxTokens: 1600,
    featureKey: "content_tools",
  });
  const suggestions = parseTopicSuggestions(aiResult.content);
  if (!suggestions) throw new Error("AI 返回的选题建议解析失败");

  return {
    suggestions,
    evidenceSummary: buildEvidenceSummary(breakoutSamples, market),
    sampleCount: breakoutSamples.length,
    marketDate: market?.context_date ?? null,
  };
}
