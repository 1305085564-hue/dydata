import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  buildTimeSlotLabel,
  computeConfidence,
  getDateDaysAgo,
  groupHour,
  normalizeHour,
} from "@/app/(app)/content-tools/utils";
import type {
  ContentToolsRequest,
  PublishRecommendationItem,
  PublishRecommendationSlot,
  TemplateCategory,
  TopicSuggestionItem,
} from "@/app/(app)/content-tools/types";
import { callAiJson } from "@/lib/ai/client";
import { breakoutCoefficient, getAccountBaseline } from "@/lib/video-metrics";
import { createClient } from "@/lib/supabase/server";
import type { MarketContextDaily, VideoMetricsSnapshot, VideoTag } from "@/types";

import {
  isContentToolsAction,
  parseTemplateCategories,
  parseTopicSuggestions,
} from "./helpers";

type VideoRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
  created_at?: string;
  accounts?:
    | { name: string; content_direction?: string | null }
    | { name: string; content_direction?: string | null }[]
    | null;
};

type TopicSuggestResult = {
  suggestions: TopicSuggestionItem[];
  evidenceSummary: string[];
  sampleCount: number;
  marketDate: string | null;
};

type TemplateLibraryResult = {
  categories: TemplateCategory[];
  sampleCount: number;
  minBreakoutCoefficient: number;
};

type PublishRecommendResult = {
  recommendations: PublishRecommendationItem[];
  sampleCount: number;
  windowDays: number;
};

type BreakoutSample = {
  videoId: string;
  title: string | null;
  content: string | null;
  accountId: string | null;
  accountName: string | null;
  contentDirection: string | null;
  publishedAt: string | null;
  playCount24h: number;
  breakoutValue: number;
  tags: VideoTag[];
};

type PublishCandidate = {
  accountId: string | null;
  accountName: string | null;
  contentDirection: string | null;
  publishedAt: string | null;
  playCount24h: number;
  isBreakout: boolean;
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey!);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractAccountMeta(accounts: VideoRow["accounts"]) {
  if (Array.isArray(accounts)) {
    return {
      name: accounts[0]?.name ?? null,
      contentDirection: accounts[0]?.content_direction ?? null,
    };
  }

  return {
    name: accounts?.name ?? null,
    contentDirection: accounts?.content_direction ?? null,
  };
}

function buildTopicPrompt(samples: BreakoutSample[], market: MarketContextDaily | null, limit: number) {
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
    `最新市场环境：${market ? JSON.stringify({
      date: market.context_date,
      sentiment: market.market_sentiment,
      hotSectors: market.hot_sectors,
      marketChange: market.market_change,
    }) : "无"}`,
    "爆款样本：",
    JSON.stringify(evidence, null, 2),
  ].join("\n");
}

function buildTemplatePrompt(groupedSamples: Array<{ category: string; samples: BreakoutSample[] }>) {
  const input = groupedSamples.map((group) => ({
    category: group.category,
    sampleCount: group.samples.length,
    samples: group.samples.slice(0, 5).map((sample) => ({
      videoId: sample.videoId,
      title: sample.title,
      accountName: sample.accountName,
      content: sample.content,
      playCount24h: sample.playCount24h,
      breakoutCoefficient: Number(sample.breakoutValue.toFixed(2)),
      tags: sample.tags.map((tag) => `${tag.tag_dimension}:${tag.tag_value}`),
    })),
  }));

  return [
    "你是短视频文案结构分析师。",
    "任务：根据高播放样本，提炼每个题材可复用的文案结构模板。",
    "只输出 JSON，不要 Markdown，不要代码块，不要额外解释。",
    '{"categories":[{"category":"...","templates":[{"name":"...","structure":["..."],"referenceVideos":[{"videoId":"...","title":"...","accountName":"..."}],"suitableFor":["..."],"evidence":"...","sampleCount":3}]}]}',
    "要求：1. 每个 template 是可复用结构，不是逐字稿。2. structure 至少 3 步。3. evidence 必须引用共同点或表现。",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function generateAiJson(prompt: string) {
  const result = await callAiJson(prompt, { maxTokens: 1600, featureKey: "content_tools" });
  return result.content;
}

function normalizeRequest(body: unknown): ContentToolsRequest | null {
  if (!isRecord(body) || !isContentToolsAction(body.action)) return null;
  return body as ContentToolsRequest;
}

async function loadScopedVideos(input: { userId: string; accountId?: string | null; startDate: string }) {
  const supabase = createServiceClient();
  let query = supabase
    .from("videos")
    .select("id, user_id, account_id, video_title, content, published_at, created_at, accounts(name, content_direction)")
    .eq("user_id", input.userId)
    .gte("created_at", `${input.startDate}T00:00:00.000Z`)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (input.accountId) {
    query = query.eq("account_id", input.accountId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as VideoRow[];
}

async function load24hSnapshots(videoIds: string[]) {
  if (videoIds.length === 0) return [] as VideoMetricsSnapshot[];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("video_metrics_snapshots")
    .select("*")
    .in("video_id", videoIds)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as VideoMetricsSnapshot[];
}

async function loadTags(videoIds: string[]) {
  if (videoIds.length === 0) return [] as VideoTag[];
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("video_tags").select("*").in("video_id", videoIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as VideoTag[];
}

async function loadLatestMarketContext() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("market_context_daily")
    .select("*")
    .order("context_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as MarketContextDaily | null;
}

function buildSnapshotMap(snapshots: VideoMetricsSnapshot[]) {
  return new Map(snapshots.map((snapshot) => [snapshot.video_id, snapshot]));
}

function buildTagMap(tags: VideoTag[]) {
  return tags.reduce<Map<string, VideoTag[]>>((map, tag) => {
    const current = map.get(tag.video_id) ?? [];
    current.push(tag);
    map.set(tag.video_id, current);
    return map;
  }, new Map());
}

function calculateBreakoutSamples(videos: VideoRow[], snapshots: VideoMetricsSnapshot[], tagMap: Map<string, VideoTag[]>) {
  const snapshotMap = buildSnapshotMap(snapshots);
  const playCountsByAccount = videos.reduce<Map<string, number[]>>((map, video) => {
    if (!video.account_id) return map;
    const snapshot = snapshotMap.get(video.id);
    if (!snapshot || snapshot.play_count <= 0) return map;
    const current = map.get(video.account_id) ?? [];
    current.push(snapshot.play_count);
    map.set(video.account_id, current);
    return map;
  }, new Map());

  const allCounts = snapshots.filter((snapshot) => snapshot.play_count > 0).map((snapshot) => snapshot.play_count);
  const teamMedian = getAccountBaseline(allCounts, null).median;

  return videos
    .map((video) => {
      const snapshot = snapshotMap.get(video.id);
      if (!snapshot || snapshot.play_count <= 0) return null;
      const meta = extractAccountMeta(video.accounts);
      const baseline = video.account_id
        ? getAccountBaseline(playCountsByAccount.get(video.account_id) ?? [], teamMedian)
        : { median: teamMedian, strategy: "insufficient" as const };
      const breakoutValue = breakoutCoefficient(snapshot.play_count, baseline.median) ?? 0;

      return {
        videoId: video.id,
        title: video.video_title,
        content: video.content,
        accountId: video.account_id,
        accountName: meta.name,
        contentDirection: meta.contentDirection,
        publishedAt: video.published_at,
        playCount24h: snapshot.play_count,
        breakoutValue,
        tags: tagMap.get(video.id) ?? [],
      } satisfies BreakoutSample;
    })
    .filter((item): item is BreakoutSample => item !== null)
    .sort((a, b) => b.playCount24h - a.playCount24h);
}

function buildEvidenceSummary(samples: BreakoutSample[], market: MarketContextDaily | null) {
  const topicCount = new Map<string, number>();
  for (const sample of samples) {
    for (const tag of sample.tags) {
      if (tag.tag_dimension !== "题材") continue;
      topicCount.set(tag.tag_value, (topicCount.get(tag.tag_value) ?? 0) + 1);
    }
  }

  const topTopics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => `${tag} 标签在爆款样本中出现 ${count} 次`);

  const topSamples = samples
    .slice(0, 2)
    .map((sample) => `${sample.accountName ?? "未知账号"}《${sample.title ?? "未命名视频"}》24h 播放 ${sample.playCount24h}`);

  return [
    ...topTopics,
    ...topSamples,
    market?.hot_sectors?.length ? `最新热点板块：${market.hot_sectors.join("、")}` : "暂无市场热点板块数据",
  ].slice(0, 4);
}

async function handleTopicSuggest(
  userId: string,
  body: Extract<ContentToolsRequest, { action: "topic_suggest" }>,
): Promise<TopicSuggestResult> {
  const today = new Date().toISOString().split("T")[0];
  const startDate = getDateDaysAgo(today, body.days ?? 14);
  const videos = await loadScopedVideos({ userId, accountId: body.accountId, startDate });
  const videoIds = videos.map((video) => video.id);
  const [snapshots, tags, market] = await Promise.all([
    load24hSnapshots(videoIds),
    loadTags(videoIds),
    loadLatestMarketContext(),
  ]);

  const tagMap = buildTagMap(tags);
  const breakoutSamples = calculateBreakoutSamples(videos, snapshots, tagMap)
    .filter((sample) => sample.breakoutValue >= 1.2)
    .slice(0, 12);

  if (breakoutSamples.length === 0) {
    return {
      suggestions: [],
      evidenceSummary: ["当前时间范围内暂无高播放样本，建议扩大时间范围后重试。"],
      sampleCount: 0,
      marketDate: market?.context_date ?? null,
    };
  }

  const prompt = buildTopicPrompt(breakoutSamples, market, Math.min(body.limit ?? 4, 5));
  const content = await generateAiJson(prompt);
  const suggestions = parseTopicSuggestions(content);
  if (!suggestions) {
    throw new Error("AI 返回的选题建议解析失败");
  }

  return {
    suggestions,
    evidenceSummary: buildEvidenceSummary(breakoutSamples, market),
    sampleCount: breakoutSamples.length,
    marketDate: market?.context_date ?? null,
  };
}

function chooseCategory(sample: BreakoutSample) {
  const topicTag = sample.tags.find((tag) => tag.tag_dimension === "题材")?.tag_value;
  return topicTag || sample.contentDirection || "未分类";
}

async function handleTemplateLibrary(
  userId: string,
  body: Extract<ContentToolsRequest, { action: "template_library" }>,
): Promise<TemplateLibraryResult> {
  const today = new Date().toISOString().split("T")[0];
  const startDate = getDateDaysAgo(today, body.days ?? 30);
  const videos = await loadScopedVideos({ userId, accountId: body.accountId, startDate });
  const videoIds = videos.map((video) => video.id);
  const [snapshots, tags] = await Promise.all([load24hSnapshots(videoIds), loadTags(videoIds)]);
  const tagMap = buildTagMap(tags);
  const minBreakoutCoefficient = body.minBreakoutCoefficient ?? 2;

  const breakoutSamples = calculateBreakoutSamples(videos, snapshots, tagMap).filter(
    (sample) => sample.breakoutValue >= minBreakoutCoefficient,
  );

  if (breakoutSamples.length === 0) {
    return {
      categories: [],
      sampleCount: 0,
      minBreakoutCoefficient,
    };
  }

  const grouped = [...breakoutSamples.reduce<Map<string, BreakoutSample[]>>((map, sample) => {
    const key = chooseCategory(sample);
    const current = map.get(key) ?? [];
    current.push(sample);
    map.set(key, current);
    return map;
  }, new Map()).entries()]
    .map(([category, samples]) => ({ category, samples: samples.slice(0, 6) }))
    .slice(0, 4);

  const prompt = buildTemplatePrompt(grouped);
  const content = await generateAiJson(prompt);
  const categories = parseTemplateCategories(content);
  if (!categories) {
    throw new Error("AI 返回的模板结构解析失败");
  }

  return {
    categories,
    sampleCount: breakoutSamples.length,
    minBreakoutCoefficient,
  };
}

function buildPublishCandidates(videos: VideoRow[], snapshots: VideoMetricsSnapshot[]) {
  const snapshotMap = buildSnapshotMap(snapshots);
  const playCountsByAccount = videos.reduce<Map<string, number[]>>((map, video) => {
    if (!video.account_id) return map;
    const snapshot = snapshotMap.get(video.id);
    if (!snapshot || snapshot.play_count <= 0) return map;
    const current = map.get(video.account_id) ?? [];
    current.push(snapshot.play_count);
    map.set(video.account_id, current);
    return map;
  }, new Map());

  const teamCounts = snapshots.filter((snapshot) => snapshot.play_count > 0).map((snapshot) => snapshot.play_count);
  const teamBaseline = getAccountBaseline(teamCounts, null).median;

  return videos
    .map((video) => {
      const snapshot = snapshotMap.get(video.id);
      if (!snapshot || snapshot.play_count <= 0) return null;
      const meta = extractAccountMeta(video.accounts);
      const baseline = video.account_id
        ? getAccountBaseline(playCountsByAccount.get(video.account_id) ?? [], teamBaseline)
        : { median: teamBaseline, strategy: "insufficient" as const };
      const breakoutValue = breakoutCoefficient(snapshot.play_count, baseline.median) ?? 0;

      return {
        accountId: video.account_id,
        accountName: meta.name,
        contentDirection: meta.contentDirection,
        publishedAt: video.published_at,
        playCount24h: snapshot.play_count,
        isBreakout: breakoutValue >= 2,
      } satisfies PublishCandidate;
    })
    .filter((item): item is PublishCandidate => item !== null && !!item.publishedAt);
}

function buildRecommendSlots(label: string, rows: PublishCandidate[]): PublishRecommendationItem | null {
  const buckets = new Map<string, { totalPlay: number; count: number; hits: number; weekday: string | null }>();

  for (const row of rows) {
    const hour = normalizeHour(row.publishedAt);
    if (hour === null) continue;
    const slot = groupHour(hour);
    const slotLabel = buildTimeSlotLabel(slot);
    const weekdayIndex = new Date(row.publishedAt!).getUTCDay();
    const weekday = WEEKDAYS[weekdayIndex];
    const bucketKey = `${weekday}-${slotLabel}`;
    const current = buckets.get(bucketKey) ?? { totalPlay: 0, count: 0, hits: 0, weekday };
    current.totalPlay += row.playCount24h;
    current.count += 1;
    current.hits += row.isBreakout ? 1 : 0;
    buckets.set(bucketKey, current);
  }

  const confidenceRank = { 低: 0, 中: 1, 高: 2 } as const;

  const recommendedSlots = [...buckets.entries()]
    .map(([key, bucket]) => {
      const hourBlock = key.split("-").slice(1).join("-");
      const avgPlayCount = bucket.count > 0 ? bucket.totalPlay / bucket.count : 0;
      const hitRate = bucket.count > 0 ? bucket.hits / bucket.count : 0;
      return {
        weekday: bucket.weekday,
        hourBlock,
        avgPlayCount,
        hitRate,
        sampleCount: bucket.count,
        confidence: computeConfidence(bucket.count, hitRate * 4),
        reason: `${bucket.count} 条样本里有 ${bucket.hits} 条达到爆款系数 2 以上。`,
      } satisfies PublishRecommendationSlot;
    })
    .filter((item) => item.sampleCount >= 1)
    .sort((a, b) => {
      if (confidenceRank[b.confidence] !== confidenceRank[a.confidence]) {
        return confidenceRank[b.confidence] - confidenceRank[a.confidence];
      }
      if (b.avgPlayCount !== a.avgPlayCount) return b.avgPlayCount - a.avgPlayCount;
      return b.sampleCount - a.sampleCount;
    })
    .slice(0, 3);

  if (recommendedSlots.length === 0) return null;
  return { dimensionLabel: label, recommendedSlots };
}

async function handlePublishRecommend(
  userId: string,
  body: Extract<ContentToolsRequest, { action: "publish_recommend" }>,
): Promise<PublishRecommendResult> {
  const today = new Date().toISOString().split("T")[0];
  const windowDays = body.days ?? 60;
  const startDate = getDateDaysAgo(today, windowDays);
  const videos = await loadScopedVideos({ userId, accountId: body.accountId, startDate });
  const snapshots = await load24hSnapshots(videos.map((video) => video.id));
  const candidates = buildPublishCandidates(videos, snapshots).filter((item) => {
    if (!body.contentDirection) return true;
    return item.contentDirection === body.contentDirection;
  });

  if (candidates.length === 0) {
    return {
      recommendations: [],
      sampleCount: 0,
      windowDays,
    };
  }

  const byAccount = body.accountId
    ? []
    : [...candidates.reduce<Map<string, PublishCandidate[]>>((map, item) => {
        const key = item.accountName ?? "未命名账号";
        const current = map.get(key) ?? [];
        current.push(item);
        map.set(key, current);
        return map;
      }, new Map()).entries()].slice(0, 4);

  const recommendations: PublishRecommendationItem[] = [];

  if (body.accountId) {
    const label = candidates[0]?.accountName ?? "当前账号";
    const current = buildRecommendSlots(label, candidates);
    if (current) recommendations.push(current);
  } else {
    const overall = buildRecommendSlots("全账号总览", candidates);
    if (overall) recommendations.push(overall);
    for (const [label, rows] of byAccount) {
      const current = buildRecommendSlots(label, rows);
      if (current) recommendations.push(current);
    }
  }

  return {
    recommendations,
    sampleCount: candidates.length,
    windowDays,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const payload = normalizeRequest(body);
  if (!payload) {
    return NextResponse.json({ error: "缺少合法 action" }, { status: 400 });
  }

  try {
    switch (payload.action) {
      case "topic_suggest": {
        const data = await handleTopicSuggest(user.id, payload);
        return NextResponse.json({ action: payload.action, data });
      }
      case "template_library": {
        const data = await handleTemplateLibrary(user.id, payload);
        return NextResponse.json({ action: payload.action, data });
      }
      case "publish_recommend": {
        const data = await handlePublishRecommend(user.id, payload);
        return NextResponse.json({ action: payload.action, data });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "内容工具处理失败" },
      { status: 500 },
    );
  }
}
