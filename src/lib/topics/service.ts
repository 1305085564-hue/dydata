import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { measureAsync } from "@/lib/perf";
import { fetchAllQueryPages } from "@/lib/supabase/query-error";
import { buildExternalMetrics, computeInternalMetrics, TOPIC_LIBRARY_QUALIFY_PLAY_COUNT, type TopicInternalMetrics, type TopicExternalMetrics } from "./metrics";

export const TOPIC_POOL_VIEWS = [
  "all",
  "my_claims",
  "my_created",
  "trending",
  "high_potential",
  "never_worked",
] as const;
export const TOPIC_TIME_RANGES = ["3d", "1w", "1m", "3m", "all"] as const;
export const TOPIC_CLAIM_STATUSES = ["writing", "cancelled", "completed"] as const;
export const TOPIC_WORK_SORTS = ["best", "recent"] as const;
export const TOPIC_POOL_SORTS = ["latest", "avg_play", "best_play", "recent_heat"] as const;

export type TopicPoolView = (typeof TOPIC_POOL_VIEWS)[number];
export type TopicTimeRange = (typeof TOPIC_TIME_RANGES)[number];
export type TopicClaimStatus = (typeof TOPIC_CLAIM_STATUSES)[number];
export type TopicWorkSort = (typeof TOPIC_WORK_SORTS)[number];
export type TopicPoolSort = (typeof TOPIC_POOL_SORTS)[number];

type TopicSupabase = SupabaseClient;

export interface TopicGroupOption {
  id: string;
  name: string;
}

export interface TopicOption {
  id: string;
  name: string;
}

export interface SuggestedSubTopicCandidate {
  id: string;
  title: string;
  hook: string | null;
  topicName: string | null;
  groupName: string | null;
}

export interface RankedSubTopicSuggestion extends SuggestedSubTopicCandidate {
  score: number;
}

export interface TopicWorkMetricInput {
  playCount: number | null;
  content: string | null;
  uploadedAt: string | null;
}

export interface TopicWorkSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
  // V3：内部成绩（团队实拍）与外部成绩（导入参考）严格分开
  internalMetrics?: TopicInternalMetrics | null;
  externalMetrics?: TopicExternalMetrics | null;
}

export const TOPIC_SOURCE_TYPES = ["internal", "external"] as const;
export const TOPIC_DURATION_RANGES = ["under_2m", "2_5m", "over_5m"] as const;
export const TOPIC_RECENT_HEAT_FILTERS = [
  "has_participants",
  "has_completed",
  "has_in_progress",
  "no_participants",
] as const;
export const TOPIC_PERFORMANCE_TIERS = ["high_best_play", "high_qualified", "high_avg_play"] as const;

export type TopicSourceType = (typeof TOPIC_SOURCE_TYPES)[number];
export type TopicDurationRange = (typeof TOPIC_DURATION_RANGES)[number];
export type TopicRecentHeatFilter = (typeof TOPIC_RECENT_HEAT_FILTERS)[number];
export type TopicPerformanceTier = (typeof TOPIC_PERFORMANCE_TIERS)[number];

export interface TopicPoolQueryOptions {
  view: TopicPoolView;
  timeRange: TopicTimeRange;
  topicIds: string[];
  page: number;
  pageSize: number;
  q?: string | null;
  sort?: TopicPoolSort;
  sourceType?: TopicSourceType;
  recentHeat?: TopicRecentHeatFilter;
  durationRange?: TopicDurationRange;
  performance?: TopicPerformanceTier;
}

export type ApiFailure = {
  ok: false;
  status: number;
  message: string;
  work_count?: number;
};

export type ApiSuccess<T> = {
  ok: true;
  value: T;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const GROUP_KEYWORDS: Record<string, string[]> = {
  图形战法: ["图形", "突破", "形态", "k线", "K线", "均线", "平台"],
  分时盘口: ["分时", "盘口", "承接", "买盘", "卖盘"],
  模式战法: ["模式", "战法", "打法", "套路"],
  龙头选股: ["龙头", "接力", "选股", "领涨"],
  打板连板: ["打板", "连板", "涨停", "炸板"],
  止盈止损: ["止盈", "止损", "卖点", "风控"],
  公告选秀: ["公告", "选秀", "公告筛选"],
  突发推演: ["突发", "推演", "预案"],
  小作文鉴定: ["小作文", "传闻", "真假"],
  政策精读: ["政策", "精读", "文件", "会议"],
  热点二阶思维: ["热点", "二阶", "预期差"],
  周期入门: ["周期", "入门"],
  每日体温计: ["体温", "情绪温度", "市场温度"],
  各阶段打法: ["阶段", "退潮", "主升", "混沌"],
  主线轮动: ["主线", "轮动", "切换"],
  空仓艺术: ["空仓", "管住手", "等待"],
  妖股成龙史: ["妖股", "成龙", "成妖"],
  单次战役: ["战役", "单次", "一战"],
  实盘日记: ["实盘", "日记", "记录"],
  龙虎榜复盘: ["龙虎榜", "席位", "游资"],
  历史行情: ["历史", "行情", "复刻"],
  骗局黑产: ["骗局", "黑产", "割韭菜"],
  ST财务雷: ["ST", "财务", "暴雷"],
  制度规则坑: ["制度", "规则", "监管"],
  心态大坑: ["心态", "亏损", "上头"],
  主力思维: ["主力", "庄", "控盘"],
  资金生态: ["资金", "生态", "博弈"],
  宏观翻译: ["宏观", "翻译", "经济"],
  产业逻辑: ["产业", "逻辑", "景气"],
  制度视角: ["制度", "视角"],
  揭秘类: ["揭秘", "真相", "内幕"],
  人性弱点: ["人性", "弱点", "贪婪", "恐惧"],
  知行合一: ["知行", "执行", "纪律"],
  交易孤独: ["孤独", "交易者"],
  盈亏哲学: ["盈亏", "哲学", "概率"],
  看盘布局: ["看盘", "布局", "屏幕"],
  条件选股: ["条件", "选股", "筛选"],
  数据资讯源: ["数据", "资讯", "信息源"],
  盘口预警: ["盘口", "预警", "异动"],
  复盘工具流: ["复盘", "工具", "流程"],
};

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function normalizePositiveInteger(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  return normalizeText(value, maxLength);
}

function isUuidLike(value: string | null) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function daysForTimeRange(range: TopicTimeRange) {
  if (range === "3d") return 3;
  if (range === "1w") return 7;
  if (range === "1m") return 30;
  if (range === "3m") return 90;
  if (range === "all") return null;
  return 90;
}

function timeRangeStartIso(range: TopicTimeRange, now = Date.now()) {
  const days = daysForTimeRange(range);
  return days === null ? null : new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .flatMap((part) => {
          if (!part) return [];
          if (/[\u4e00-\u9fff]/.test(part)) {
            const grams: string[] = [part];
            for (let index = 0; index < part.length - 1; index += 1) {
              grams.push(part.slice(index, index + 2));
            }
            return grams;
          }
          return [part];
        })
        .filter(Boolean),
    ),
  );
}

function getScore(haystack: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

export function buildPoolQueryOptions(searchParams: URLSearchParams):
  | { ok: true; options: TopicPoolQueryOptions }
  | ApiFailure {
  const view = searchParams.get("view") ?? "all";
  if (!isOneOf(TOPIC_POOL_VIEWS, view)) {
    return {
      ok: false,
      status: 400,
      message: "view 只能是 all、my_claims、my_created、trending、high_potential 或 never_worked",
    };
  }

  const timeRange = searchParams.get("time_range") ?? "all";
  if (!isOneOf(TOPIC_TIME_RANGES, timeRange)) {
    return { ok: false, status: 400, message: "time_range 只能是 3d、1w、1m、3m 或 all" };
  }

  const sortParam = searchParams.get("sort") ?? undefined;
  if (sortParam && !isOneOf(TOPIC_POOL_SORTS, sortParam)) {
    return { ok: false, status: 400, message: "sort 只能是 latest、avg_play、best_play 或 recent_heat" };
  }
  const sort: TopicPoolSort | undefined = sortParam ? sortParam as TopicPoolSort : undefined;

  const topicIdsRaw = searchParams.getAll("topic_id");
  const topicIds: string[] = [];
  for (const raw of topicIdsRaw) {
    const trimmed = raw.trim();
    if (trimmed && !isUuidLike(trimmed)) {
      return { ok: false, status: 400, message: "topic_id 格式不正确" };
    }
    if (trimmed) {
      topicIds.push(trimmed);
    }
  }

  const query = normalizeText(searchParams.get("q"), 100);

  const sourceType = searchParams.get("source_type") ?? undefined;
  if (sourceType && !isOneOf(TOPIC_SOURCE_TYPES, sourceType)) {
    return { ok: false, status: 400, message: "source_type 只能是 internal 或 external" };
  }
  const recentHeat = searchParams.get("recent_heat") ?? undefined;
  if (recentHeat && !isOneOf(TOPIC_RECENT_HEAT_FILTERS, recentHeat)) {
    return {
      ok: false,
      status: 400,
      message: "recent_heat 只能是 has_participants、has_completed、has_in_progress 或 no_participants",
    };
  }
  const durationRange = searchParams.get("duration_range") ?? undefined;
  if (durationRange && !isOneOf(TOPIC_DURATION_RANGES, durationRange)) {
    return { ok: false, status: 400, message: "duration_range 只能是 under_2m、2_5m 或 over_5m" };
  }
  const performance = searchParams.get("performance") ?? undefined;
  if (performance && !isOneOf(TOPIC_PERFORMANCE_TIERS, performance)) {
    return { ok: false, status: 400, message: "performance 只能是 high_best_play、high_qualified 或 high_avg_play" };
  }

  return {
    ok: true,
    options: {
      view,
      timeRange,
      topicIds,
      page: normalizePositiveInteger(searchParams.get("page"), 1, 10000),
      pageSize: normalizePositiveInteger(searchParams.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(query ? { q: query } : {}),
      ...(sort ? { sort } : {}),
      ...(sourceType ? { sourceType: sourceType as TopicSourceType } : {}),
      ...(recentHeat ? { recentHeat: recentHeat as TopicRecentHeatFilter } : {}),
      ...(durationRange ? { durationRange: durationRange as TopicDurationRange } : {}),
      ...(performance ? { performance: performance as TopicPerformanceTier } : {}),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFilterBuilder = { lt: (col: string, val: number) => any; gte: (col: string, val: number) => any; lte: (col: string, val: number) => any; gt: (col: string, val: number) => any };

/** 视频时长区间过滤（真实秒数，无时长数据不归入任何区间）。 */
function applyDurationRangeFilter<T extends AnyFilterBuilder>(query: T, durationRange: TopicDurationRange): T {
  if (durationRange === "under_2m") return query.lt("duration_seconds", 120);
  if (durationRange === "2_5m") return query.gte("duration_seconds", 120).lte("duration_seconds", 300);
  return query.gt("duration_seconds", 300);
}

/** 近 7 天热度与历史成绩过滤：基于服务端计算的真实值做后置过滤。 */
export function matchesPostFilters(
  item: { recent7dParticipants?: number; recent7dCompletedCount?: number; recent7dInProgressCount?: number; summary?: { bestPlayCount?: number | null; qualifiedWorkCount?: number; averagePlayCount?: number | null } | null },
  options: Pick<TopicPoolQueryOptions, "recentHeat" | "performance">,
) {
  if (options.recentHeat) {
    const participants = item.recent7dParticipants ?? 0;
    const completed = item.recent7dCompletedCount ?? 0;
    const inProgress = item.recent7dInProgressCount ?? 0;
    if (options.recentHeat === "has_participants" && participants <= 0) return false;
    if (options.recentHeat === "has_completed" && completed <= 0) return false;
    if (options.recentHeat === "has_in_progress" && inProgress <= 0) return false;
    if (options.recentHeat === "no_participants" && participants !== 0) return false;
  }
  if (options.performance) {
    const summary = item.summary;
    if (options.performance === "high_best_play" && (summary?.bestPlayCount ?? 0) < 100_000) return false;
    if (options.performance === "high_qualified" && (summary?.qualifiedWorkCount ?? 0) < 1) return false;
    if (options.performance === "high_avg_play" && (summary?.averagePlayCount ?? 0) < TOPIC_LIBRARY_QUALIFY_PLAY_COUNT) return false;
  }
  return true;
}

export function buildWorksQueryOptions(searchParams: URLSearchParams):
  | { ok: true; options: { sort: TopicWorkSort; page: number; pageSize: number } }
  | ApiFailure {
  const sort = searchParams.get("sort") ?? "best";
  if (!isOneOf(TOPIC_WORK_SORTS, sort)) {
    return { ok: false, status: 400, message: "sort 只能是 best 或 recent" };
  }

  return {
    ok: true,
    options: {
      sort,
      page: normalizePositiveInteger(searchParams.get("page"), 1, 10000),
      pageSize: normalizePositiveInteger(searchParams.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    },
  };
}

export function matchTopicGroup(groups: TopicGroupOption[], title: string, hook: string) {
  const haystack = `${title} ${hook}`.toLowerCase();
  let best: { groupId: string; score: number } | null = null;

  for (const group of groups) {
    const keywords = [group.name, ...(GROUP_KEYWORDS[group.name] ?? [])];
    const score = getScore(haystack, keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { groupId: group.id, score };
    }
  }

  return best?.groupId ?? null;
}

export function rankSuggestedSubTopics(
  candidates: SuggestedSubTopicCandidate[],
  input: { title: string; content: string },
): RankedSubTopicSuggestion[] {
  const inputTokens = tokenize(`${input.title} ${input.content}`);
  const inputSet = new Set(inputTokens);

  return candidates
    .map((candidate) => {
      const candidateTokens = tokenize(`${candidate.title} ${candidate.hook} ${candidate.topicName ?? ""} ${candidate.groupName ?? ""}`);
      const overlap = candidateTokens.filter((token) => inputSet.has(token)).length;
      const exactBoost = `${input.title} ${input.content}`.includes(candidate.title) ? 3 : 0;
      return {
        ...candidate,
        score: overlap + exactBoost,
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, 3);
}

export function calculateTopicWorkSummary(rows: TopicWorkMetricInput[]): TopicWorkSummary {
  const qualified = rows.filter((row) => (row.playCount ?? 0) >= 30_000);
  const totalPlayCount = qualified.reduce((sum, row) => sum + (row.playCount ?? 0), 0);
  const best = [...qualified].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))[0] ?? null;
  const latest = [...qualified].sort((a, b) => (Date.parse(b.uploadedAt ?? "") || 0) - (Date.parse(a.uploadedAt ?? "") || 0))[0] ?? null;

  return {
    qualifiedWorkCount: qualified.length,
    averagePlayCount: qualified.length ? Math.round(totalPlayCount / qualified.length) : null,
    bestPlayCount: best?.playCount ?? null,
    bestCopy: best?.content ?? null,
    latestCopy: latest?.content ?? null,
  };
}

export function buildClaimActivity(
  rows: Array<Record<string, unknown> & { user_id?: string | null; status?: string | null; claimed_at?: string | null }>,
  scope: DataAccessScope,
) {
  const writingRows = rows.filter((row) => row.status === "writing");
  const inProgressCount = writingRows.length;
  const claims = applyScope(writingRows, scope)
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const displayName = typeof (profile as { name?: unknown } | null)?.name === "string"
        ? (profile as { name: string }).name
        : "未命名成员";
      return {
        userId: String(row.user_id),
        displayName,
        status: "writing" as Extract<TopicClaimStatus, "writing">,
        claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
      };
    })
    .sort((a, b) => (Date.parse(b.claimedAt ?? "") || 0) - (Date.parse(a.claimedAt ?? "") || 0));

  // candidateCount / scriptingCount 为旧契约兼容键，语义已统一为「正在写人数」
  return { claims, inProgressCount, candidateCount: inProgressCount, scriptingCount: inProgressCount };
}

export function validateRecommendationSubTopicInput(body: unknown) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, message: "请求体格式不正确" };
  }

  const payload = body as Record<string, unknown>;
  const title = normalizeText(payload.title, 120);
  const hook = normalizeText(payload.angle, 500);
  if (!title) return { ok: false as const, status: 400, message: "title 为必填项" };
  if (!hook) return { ok: false as const, status: 400, message: "angle 为必填项" };

  return {
    ok: true as const,
    value: {
      title,
      hook,
      category: normalizeOptionalText(payload.category, 120),
      emotionTag: normalizeOptionalText(payload.emotion_tag, 40),
      audience: normalizeOptionalText(payload.audience, 80),
    },
  };
}

export function validateSubTopicInput(body: unknown, mode: "create" | "update") {
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, message: "请求体格式不正确" };
  }

  const payload = body as Record<string, unknown>;
  const title = normalizeText(payload.title, 120);
  const hook = normalizeText(payload.hook, 500);
  const topicId = normalizeText(payload.topic_id, 80);

  if (mode === "create") {
    if (!title) return { ok: false as const, status: 400, message: "title 为必填项" };
    if (!topicId) return { ok: false as const, status: 400, message: "topic_id 为必填项" };
  }

  return {
    ok: true as const,
    value: {
      title,
      hook,
      topicId,
      emotionTag: normalizeOptionalText(payload.emotion_tag, 40),
      source: normalizeOptionalText(payload.source, 40),
      audience: normalizeOptionalText(payload.audience, 80),
    },
  };
}

export async function loadTopicGroups(supabase: TopicSupabase, topicId: string): Promise<TopicGroupOption[]> {
  const { data, error } = await supabase
    .from("topic_groups")
    .select("id, name")
    .eq("topic_id", topicId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; name: string }>).filter((row) => row.id && row.name);
}

export async function loadTopicOptions(supabase: TopicSupabase): Promise<ApiResult<{ topics: TopicOption[] }>> {
  const { data, error } = await supabase
    .from("topics")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return { ok: false, status: 500, message: error.message };

  const topics = ((data ?? []) as Array<{ id?: unknown; name?: unknown; sort_order?: unknown }>)
    .filter((row) => typeof row.id === "string" && typeof row.name === "string" && row.name.trim())
    .sort((left, right) => {
      const leftOrder = typeof left.sort_order === "number" ? left.sort_order : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.sort_order === "number" ? right.sort_order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || String(left.name).localeCompare(String(right.name), "zh-Hans-CN");
    })
    .map((row) => ({ id: row.id as string, name: row.name as string }));

  return { ok: true, value: { topics } };
}

export async function createSubTopic(supabase: TopicSupabase, userId: string, body: unknown): Promise<ApiResult<unknown>> {
  const validation = validateSubTopicInput(body, "create");
  if (!validation.ok) return validation;

  const groups = await loadTopicGroups(supabase, validation.value.topicId ?? "");
  const groupId = matchTopicGroup(groups, validation.value.title ?? "", validation.value.hook ?? "");
  const payload = {
    title: validation.value.title,
    hook: validation.value.hook,
    topic_id: validation.value.topicId,
    group_id: groupId,
    emotion_tag: validation.value.emotionTag,
    source: validation.value.source ?? "manual",
    audience: validation.value.audience,
    created_by: userId,
  };

  const { data, error } = await supabase.from("sub_topics").insert(payload).select("*").single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}

export async function createSubTopicFromRecommendation(
  supabase: TopicSupabase,
  userId: string,
  body: unknown,
): Promise<ApiResult<unknown>> {
  const validation = validateRecommendationSubTopicInput(body);
  if (!validation.ok) return validation;
  if (!validation.value.category) {
    return { ok: false, status: 400, message: "category 未匹配到现有母题，不能采纳该建议" };
  }

  const { data: topic, error } = await supabase
    .from("topics")
    .select("id")
    .eq("name", validation.value.category)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: "查询母题失败" };
  if (!topic) {
    return { ok: false, status: 400, message: "category 未匹配到现有母题，不能采纳该建议" };
  }

  return createSubTopic(supabase, userId, {
    title: validation.value.title,
    hook: validation.value.hook,
    topic_id: (topic as { id: string }).id,
    emotion_tag: validation.value.emotionTag,
    audience: validation.value.audience,
    source: "ai_recommendation",
  });
}

export async function updateSubTopic(supabase: TopicSupabase, userId: string, id: string, body: unknown): Promise<ApiResult<unknown>> {
  const validation = validateSubTopicInput(body, "update");
  if (!validation.ok) return validation;

  const { data: existing, error: existingError } = await supabase
    .from("sub_topics")
    .select("id, created_by, topic_id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message };
  if (!existing) return { ok: false, status: 404, message: "子题不存在" };
  if ((existing as { created_by?: string }).created_by !== userId) {
    return { ok: false, status: 403, message: "只能编辑自己创建的子题" };
  }

  const topicId = validation.value.topicId ?? (existing as { topic_id: string }).topic_id;
  const nextTitle = validation.value.title;
  const nextHook = validation.value.hook;
  const patch: Record<string, string | null> = {};
  if (nextTitle) patch.title = nextTitle;
  if (nextHook) patch.hook = nextHook;
  if (validation.value.topicId) patch.topic_id = validation.value.topicId;
  if (validation.value.emotionTag !== null) patch.emotion_tag = validation.value.emotionTag;
  if (validation.value.source !== null) patch.source = validation.value.source;
  if (validation.value.audience !== null) patch.audience = validation.value.audience;

  if (nextTitle || nextHook || validation.value.topicId) {
    const groups = await loadTopicGroups(supabase, topicId);
    const { data: current } = await supabase.from("sub_topics").select("title, hook").eq("id", id).single();
    patch.group_id = matchTopicGroup(
      groups,
      nextTitle ?? (current as { title?: string } | null)?.title ?? "",
      nextHook ?? (current as { hook?: string } | null)?.hook ?? "",
    );
  }

  const { data, error } = await supabase.from("sub_topics").update(patch).eq("id", id).select("*").single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}

export async function deleteSubTopic(supabase: TopicSupabase, userId: string, id: string): Promise<ApiResult<{ deleted: true }>> {
  const { data: existing, error: existingError } = await supabase
    .from("sub_topics")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message };
  if (!existing) return { ok: false, status: 404, message: "子题不存在" };
  if ((existing as { created_by?: string }).created_by !== userId) {
    return { ok: false, status: 403, message: "只能删除自己创建的子题" };
  }

  const { count, error: worksError } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle_state", "active")
    .eq("topic_id", id);
  if (worksError) return { ok: false, status: 500, message: worksError.message };
  if ((count ?? 0) > 0) {
    return { ok: false, status: 409, message: "已有作品关联，不能删除该子题", work_count: count ?? 0 };
  }

  const { error } = await supabase.from("sub_topics").delete().eq("id", id);
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: { deleted: true } };
}

/**
 * V3 多人写作：同一选题允许多人同时写；同一成员对同一选题只有一个有效写作状态，
 * 重复点击保持幂等；不设旧候选上限，不做撞车阻断。
 */
export async function startWritingClaim(supabase: TopicSupabase, userId: string, subTopicId: string): Promise<ApiResult<unknown>> {
  const { data: topic, error: topicError } = await supabase
    .from("sub_topics")
    .select("id, library_status")
    .eq("id", subTopicId)
    .maybeSingle();
  if (topicError) return { ok: false, status: 500, message: topicError.message };
  if (!topic) return { ok: false, status: 404, message: "选题不存在" };
  if ((topic as { library_status?: string }).library_status === "removed") {
    return { ok: false, status: 409, message: "该选题已被移出选题库，不能开始写作" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("sub_topic_claims")
    .select("*")
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message };
  if (existing) return { ok: true, value: existing };

  const { data, error } = await supabase
    .from("sub_topic_claims")
    .insert({ sub_topic_id: subTopicId, user_id: userId, status: "writing" })
    .select("*")
    .single();
  if (error) {
    // 唯一索引兜底：并发重复点击时回读现有写作状态
    if (error.message.includes("sub_topic_claims_one_writing_per_user_topic")) {
      const { data: raced } = await supabase
        .from("sub_topic_claims")
        .select("*")
        .eq("sub_topic_id", subTopicId)
        .eq("user_id", userId)
        .eq("status", "writing")
        .maybeSingle();
      if (raced) return { ok: true, value: raced };
    }
    return { ok: false, status: 500, message: error.message };
  }
  return { ok: true, value: data };
}

/** 手动取消写作：只有正在写的记录能取消，幂等。 */
export async function cancelWritingClaim(supabase: TopicSupabase, userId: string, subTopicId: string): Promise<ApiResult<unknown>> {
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, status: 500, message: error.message };
  if (!data) return { ok: false, status: 404, message: "未找到正在写的记录" };
  return { ok: true, value: data };
}

/** 提交关联作品成功后结束正在写；幂等，无在写记录时静默跳过。 */
export async function completeWritingClaim(
  supabase: TopicSupabase,
  userId: string,
  subTopicId: string,
  videoId: string,
): Promise<ApiResult<unknown>> {
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .update({ status: "completed", ended_at: new Date().toISOString(), completed_video_id: videoId })
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}

function applyScope<T extends { user_id?: string | null }>(rows: T[], scope: DataAccessScope) {
  if (scope.kind === "all") return rows;
  return rows.filter((row) => row.user_id && scope.visibleUserIds.includes(row.user_id));
}

export function filterTopicClaimsByScope<T extends { user_id?: string | null }>(
  rows: T[],
  scope: DataAccessScope
) {
  return applyScope(rows, scope);
}

export interface CurrentUserClaim {
  id: string;
  subTopicId: string;
  status: Extract<TopicClaimStatus, "writing">;
  claimedAt: string | null;
}

export function buildMyClaim(
  rows: Array<{ id?: unknown; sub_topic_id?: unknown; user_id?: unknown; status?: unknown; claimed_at?: unknown }>,
  userId: string,
  subTopicId: string,
): CurrentUserClaim | null {
  const match = rows
    .filter((row) => (
      row.user_id === userId &&
      row.sub_topic_id === subTopicId &&
      row.status === "writing" &&
      typeof row.id === "string"
    ))
    .sort((left, right) => (Date.parse(String(right.claimed_at ?? "")) || 0) - (Date.parse(String(left.claimed_at ?? "")) || 0))[0];

  if (!match || typeof match.id !== "string") return null;
  return {
    id: match.id,
    subTopicId,
    status: "writing",
    claimedAt: typeof match.claimed_at === "string" ? match.claimed_at : null,
  };
}

type SortableTopicPoolItem = {
  id: string;
  created_at?: string | null;
  title?: string | null;
  hook?: string | null;
  claimCount?: number;
  summary?: { averagePlayCount?: number | null; bestPlayCount?: number | null } | null;
  recent7dParticipants?: number;
};

export function sortTopicPoolItems<T extends SortableTopicPoolItem>(items: T[], sort: TopicPoolSort): T[] {
  return [...items].sort((left, right) => {
    if (sort === "avg_play") {
      const difference = (right.summary?.averagePlayCount ?? 0) - (left.summary?.averagePlayCount ?? 0);
      if (difference !== 0) return difference;
    } else if (sort === "best_play") {
      const difference = (right.summary?.bestPlayCount ?? 0) - (left.summary?.bestPlayCount ?? 0);
      if (difference !== 0) return difference;
    } else if (sort === "recent_heat") {
      const difference = (right.recent7dParticipants ?? 0) - (left.recent7dParticipants ?? 0);
      if (difference !== 0) return difference;
    } else {
      const difference = (Date.parse(String(right.created_at ?? "")) || 0) - (Date.parse(String(left.created_at ?? "")) || 0);
      if (difference !== 0) return difference;
    }
    return left.id.localeCompare(right.id);
  });
}

export function matchesTopicPoolQuery(item: { title?: unknown; hook?: unknown }, query: string | null | undefined) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase();
  const title = typeof item.title === "string" ? item.title.toLocaleLowerCase() : "";
  const hook = typeof item.hook === "string" ? item.hook.toLocaleLowerCase() : "";
  return title.includes(needle) || hook.includes(needle);
}

type ScoreMode = "trending" | "high_potential";

function calcFlowScore(avgPlayCount: number | null) {
  const playCount = avgPlayCount ?? 0;
  if (playCount >= 200_000) return 0.6;
  if (playCount >= 100_000) return 0.5;
  if (playCount >= 50_000) return 0.4;
  if (playCount >= 30_000) return 0.3;
  return 0.1;
}

function calcTimeScore(daysSinceLastWork: number, mode: ScoreMode) {
  if (mode === "trending") {
    if (daysSinceLastWork <= 3) return 0.4;
    if (daysSinceLastWork <= 7) return 0.3;
    return 0.2;
  }
  if (daysSinceLastWork > 60) return 0.4;
  if (daysSinceLastWork > 45) return 0.3;
  return 0.2;
}

function calcTopicScore(avgPlayCount: number | null, daysSinceLastWork: number, mode: ScoreMode) {
  return calcFlowScore(avgPlayCount) + calcTimeScore(daysSinceLastWork, mode);
}

function buildTopicPoolItem(
  item: Record<string, unknown>,
  userId: string,
  scope: DataAccessScope,
  summary: TopicWorkSummary,
  extra: Record<string, unknown> = {},
): SortableTopicPoolItem & Record<string, unknown> {
  const rawClaims = Array.isArray(item.sub_topic_claims)
    ? item.sub_topic_claims as Array<{ id?: unknown; sub_topic_id?: unknown; user_id?: string | null; status?: string; claimed_at?: unknown }>
    : [];
  const visibleClaims = filterTopicClaimsByScope(rawClaims, scope);
  const activeVisibleClaims = visibleClaims.filter((claim) => claim.status === "writing");
  const myClaim = buildMyClaim(rawClaims, userId, String(item.id));
  return {
    ...item,
    id: String(item.id ?? ""),
    sub_topic_claims: visibleClaims,
    summary,
    myClaim,
    claimCount: activeVisibleClaims.length,
    // 旧契约兼容键：V3 中所有有效写作状态统一为 writing（C 包清理）
    candidateCount: activeVisibleClaims.length,
    scriptingCount: activeVisibleClaims.length,
    inProgressCount: activeVisibleClaims.length,
    isWritingByMe: myClaim?.status === "writing",
    externalMetrics: buildExternalMetrics(item),
    ...extra,
  };
}

async function loadScoredTopicPool(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
  options: TopicPoolQueryOptions,
  mode: ScoreMode,
): Promise<ApiResult<unknown>> {
  let subTopicsQuery = supabase
    .from("sub_topics")
    .select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)")
    .eq("library_status", "in_library")
    .order("created_at", { ascending: false });
  if (options.topicIds.length > 0) subTopicsQuery = subTopicsQuery.in("topic_id", options.topicIds);
  if (options.sourceType) subTopicsQuery = subTopicsQuery.eq("source_type", options.sourceType);
  if (options.durationRange) subTopicsQuery = applyDurationRangeFilter(subTopicsQuery, options.durationRange);

  const { data: subTopics, error: subTopicsError } = await measureAsync("topics.pool.scored.subTopics", () => subTopicsQuery);
  if (subTopicsError) return { ok: false, status: 500, message: subTopicsError.message };

  const allSubTopics = (subTopics ?? []) as Array<Record<string, unknown>>;
  const subTopicIds = allSubTopics.map((item) => String(item.id));
  if (subTopicIds.length === 0) {
    return {
      ok: true,
      value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } },
    };
  }

  const aggregates = await tryLoadTopicPoolAggregates(supabase, scope);

  let heat: Map<string, Recent7dHeat>;
  if (aggregates) {
    heat = aggregatesToHeatMap(aggregates);
  } else {
    try {
      heat = await measureAsync("topics.pool.scored.heat", () => loadRecent7dHeat(supabase, subTopicIds));
    } catch (error) {
      return { ok: false, status: 500, message: error instanceof Error ? error.message : "七天热度加载失败" };
    }
  }

  const worksBySubTopic = new Map<string, { latestUploadedAt: string; playCounts: number[] }>();
  let fallbackWorks: unknown[] = [];
  if (!aggregates) {
    // content 一并取出，让汇总统计直接复用这次结果，省掉一次同表全量扫描
    const works = await measureAsync("topics.pool.scored.works", () => fetchAllQueryPages<ScopedWorkRow>(
      (from, to) => {
        let worksQuery = supabase
          .from("videos")
          .select("topic_id, user_id, content, uploaded_at, video_metrics_snapshots(play_count)")
          .eq("lifecycle_state", "active")
          .in("topic_id", subTopicIds);
        if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
        return worksQuery
          .order("uploaded_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
      },
      "加载选题作品失败",
    ));
    fallbackWorks = works;

    const scopedWorks = applyScope(
      (works ?? []) as Array<Record<string, unknown> & { user_id?: string | null }>,
      scope,
    );
    for (const work of scopedWorks) {
      const subTopicId = String(work.topic_id ?? "");
      if (!subTopicId) continue;
      const uploadedAt = typeof work.uploaded_at === "string" ? work.uploaded_at : "";
      const snapshots = Array.isArray(work.video_metrics_snapshots)
        ? work.video_metrics_snapshots as Array<{ play_count?: number | null }>
        : [];
      const playCount = snapshots.reduce(
        (maximum, snapshot) => Math.max(maximum, Number(snapshot.play_count ?? 0)),
        0,
      );
      const aggregate = worksBySubTopic.get(subTopicId);
      if (!aggregate) {
        worksBySubTopic.set(subTopicId, { latestUploadedAt: uploadedAt, playCounts: [playCount] });
        continue;
      }
      if (uploadedAt > aggregate.latestUploadedAt) aggregate.latestUploadedAt = uploadedAt;
      aggregate.playCounts.push(playCount);
    }
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const scored: Array<{
    item: Record<string, unknown>;
    score: number;
    daysSinceLastWork: number;
    avgPlayCount: number | null;
    bestPlayCount: number | null;
    qualifiedCount: number;
    recent7dParticipants: number;
    recent7dCompletedCount: number;
    recent7dInProgressCount: number;
  }> = [];
  for (const item of allSubTopics) {
    let avgPlayCount: number | null;
    let bestPlayCount: number | null;
    let qualifiedCount: number;
    let daysSinceLastWork: number;
    if (aggregates) {
      const aggregate = aggregates.get(String(item.id));
      if (!aggregate) continue;
      avgPlayCount = aggregate.averagePlayCount;
      bestPlayCount = aggregate.bestPlayCount;
      qualifiedCount = aggregate.qualifiedWorkCount;
      const latestTimestamp = Date.parse(aggregate.latestUploadedAt ?? "");
      daysSinceLastWork = Number.isFinite(latestTimestamp)
        ? Math.max(0, Math.floor((now - latestTimestamp) / millisecondsPerDay))
        : 999;
    } else {
      const aggregate = worksBySubTopic.get(String(item.id));
      if (!aggregate) continue;
      const qualifiedPlayCounts = aggregate.playCounts.filter((playCount) => playCount >= 30_000);
      avgPlayCount = qualifiedPlayCounts.length
        ? Math.round(qualifiedPlayCounts.reduce((total, playCount) => total + playCount, 0) / qualifiedPlayCounts.length)
        : null;
      const latestTimestamp = Date.parse(aggregate.latestUploadedAt);
      daysSinceLastWork = Number.isFinite(latestTimestamp)
        ? Math.max(0, Math.floor((now - latestTimestamp) / millisecondsPerDay))
        : 999;
      bestPlayCount = qualifiedPlayCounts.length ? Math.max(...qualifiedPlayCounts) : null;
      qualifiedCount = qualifiedPlayCounts.length;
    }
    if (mode === "trending" && daysSinceLastWork > 30) continue;
    if (mode === "high_potential" && daysSinceLastWork <= 30) continue;
    if (!matchesTopicPoolQuery(item, options.q)) continue;
    const heatEntry = heat.get(String(item.id));
    scored.push({
      item,
      score: calcTopicScore(avgPlayCount, daysSinceLastWork, mode),
      daysSinceLastWork,
      avgPlayCount,
      bestPlayCount,
      qualifiedCount,
      recent7dParticipants: heatEntry?.participants ?? 0,
      recent7dCompletedCount: heatEntry?.completedCount ?? 0,
      recent7dInProgressCount: heatEntry?.inProgressCount ?? 0,
    });
  }

  const filteredScored = options.recentHeat || options.performance
    ? scored.filter((entry) => matchesPostFilters(
        {
          recent7dParticipants: entry.recent7dParticipants,
          recent7dCompletedCount: entry.recent7dCompletedCount,
          recent7dInProgressCount: entry.recent7dInProgressCount,
          summary: { bestPlayCount: entry.bestPlayCount, qualifiedWorkCount: entry.qualifiedCount, averagePlayCount: entry.avgPlayCount },
        },
        options,
      ))
    : scored;
  void scored;

  filteredScored.sort((left, right) => {
    if (options.sort === "avg_play") {
      return (right.avgPlayCount ?? 0) - (left.avgPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
    }
    if (options.sort === "best_play") {
      return (right.bestPlayCount ?? 0) - (left.bestPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
    }
    if (options.sort === "recent_heat") {
      const leftHeat = heat.get(String(left.item.id))?.participants ?? 0;
      const rightHeat = heat.get(String(right.item.id))?.participants ?? 0;
      return rightHeat - leftHeat || String(left.item.id).localeCompare(String(right.item.id));
    }
    if (options.sort === "latest") {
      return (Date.parse(String(right.item.created_at ?? "")) || 0) - (Date.parse(String(left.item.created_at ?? "")) || 0) || String(left.item.id).localeCompare(String(right.item.id));
    }
    return right.score - left.score || (right.avgPlayCount ?? 0) - (left.avgPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
  });

  const totalItems = filteredScored.length;
  const from = (options.page - 1) * options.pageSize;
  const pageItems = filteredScored.slice(from, from + options.pageSize);
  const summaries = aggregates
    ? aggregatesToSummaryMap(aggregates)
    : summarizeScopedWorksBySubTopic(fallbackWorks as ScopedWorkRow[], scope);

  return {
    ok: true,
    value: {
      items: pageItems.map(({ item, score, daysSinceLastWork, avgPlayCount, bestPlayCount }) =>
        buildTopicPoolItem(
          item,
          userId,
          scope,
          summaries.get(String(item.id)) ?? calculateTopicWorkSummary([]),
          {
            _score: score,
            _daysSinceLastWork: daysSinceLastWork,
            _avgPlayCount: avgPlayCount,
            _bestPlayCount: bestPlayCount,
            ...recent7dHeatExtra(heat, String(item.id)),
          },
        ),
      ),
      pagination: { page: options.page, pageSize: options.pageSize, totalItems },
    },
  };
}

async function loadNeverWorkedTopics(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
  options: TopicPoolQueryOptions,
): Promise<ApiResult<unknown>> {
  let subTopicsQuery = supabase
    .from("sub_topics")
    .select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)")
    .eq("library_status", "in_library")
    .order("created_at", { ascending: false });
  if (options.topicIds.length > 0) subTopicsQuery = subTopicsQuery.in("topic_id", options.topicIds);
  if (options.sourceType) subTopicsQuery = subTopicsQuery.eq("source_type", options.sourceType);
  if (options.durationRange) subTopicsQuery = applyDurationRangeFilter(subTopicsQuery, options.durationRange);

  const { data: subTopics, error: subTopicsError } = await subTopicsQuery;
  if (subTopicsError) return { ok: false, status: 500, message: subTopicsError.message };

  const allSubTopics = (subTopics ?? []) as Array<Record<string, unknown>>;
  const subTopicIds = allSubTopics.map((item) => String(item.id));
  if (subTopicIds.length === 0) {
    return {
      ok: true,
      value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } },
    };
  }

  const aggregates = await tryLoadTopicPoolAggregates(supabase, scope);

  let heat: Map<string, Recent7dHeat>;
  if (aggregates) {
    heat = aggregatesToHeatMap(aggregates);
  } else {
    try {
      heat = await measureAsync("topics.pool.neverWorked.heat", () => loadRecent7dHeat(supabase, subTopicIds));
    } catch (error) {
      return { ok: false, status: 500, message: error instanceof Error ? error.message : "七天热度加载失败" };
    }
  }

  let workedIds: Set<string>;
  if (aggregates) {
    // 聚合行只包含"有作品"的子题，缺席即从未写过
    workedIds = new Set(aggregates.keys());
  } else {
    const works = await fetchAllQueryPages<{ topic_id?: string | null; user_id?: string | null }>(
      (from, to) => {
        let worksQuery = supabase
          .from("videos")
          .select("topic_id, user_id")
          .eq("lifecycle_state", "active")
          .in("topic_id", subTopicIds);
        if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
        return worksQuery
          .order("id", { ascending: true })
          .range(from, to);
      },
      "加载选题作品失败",
    );

    workedIds = new Set(
      applyScope(
        works,
        scope,
      )
        .map((work) => work.topic_id)
        .filter((id): id is string => Boolean(id)),
    );
  }
  const neverWorked = allSubTopics
    .filter((item) => !workedIds.has(String(item.id)))
    .filter((item) => matchesTopicPoolQuery(item, options.q));
  const builtItems = neverWorked.map((item) =>
    buildTopicPoolItem(item, userId, scope, calculateTopicWorkSummary([]), {
      _daysSinceLastWork: null,
      _avgPlayCount: null,
      ...recent7dHeatExtra(heat, String(item.id)),
    }),
  );
  const sortedItems = options.sort
    ? sortTopicPoolItems(builtItems as Array<SortableTopicPoolItem & Record<string, unknown>>, options.sort)
    : builtItems;
  const from = (options.page - 1) * options.pageSize;
  const pageItems = sortedItems.slice(from, from + options.pageSize);

  return {
    ok: true,
    value: {
      items: pageItems,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: sortedItems.length,
      },
    },
  };
}

export async function loadSubTopicDetail(
  supabase: TopicSupabase,
  id: string,
  userId: string,
  scope: DataAccessScope,
): Promise<ApiResult<unknown>> {
  const { data: subTopic, error } = await supabase
    .from("sub_topics")
    .select("*, topics(id, name), topic_groups(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  if (!subTopic) return { ok: false, status: 404, message: "子题不存在" };
  if ((subTopic as { library_status?: string }).library_status === "removed") {
    return { ok: false, status: 404, message: "该选题已被管理员移出选题库" };
  }

  // 认领状态由前端经 /api/topics/pool?view=my_claims 判定，详情不再重复查 claims（2026-08-26）

  // 复用已取出的子题行，works 内部不再重复查 sub_topics（2026-08-30）
  const works = await loadSubTopicWorks(supabase, id, scope, { sort: "best", page: 1, pageSize: 20 }, {
    topic_id: (subTopic as { topic_id?: string | null }).topic_id ?? null,
    group_id: (subTopic as { group_id?: string | null }).group_id ?? null,
    library_status: (subTopic as { library_status?: string }).library_status ?? null,
  }, { includeSimilar: false });
  if (!works.ok) return works;
  return {
    ok: true,
    value: {
      subTopic,
      works: works.value,
    },
  };
}

async function tryLoadTopicPoolAggregates(
  supabase: TopicSupabase,
  scope: DataAccessScope,
): Promise<Map<string, TopicPoolWorkAggregate> | null> {
  try {
    return await measureAsync("topics.pool.aggregates", () => loadTopicPoolWorkAggregates(supabase, scope));
  } catch {
    // RPC 未部署或查询失败时回退到内存聚合路径，行为与迁移前一致
    return null;
  }
}

function aggregatesToHeatMap(aggregates: Map<string, TopicPoolWorkAggregate>) {
  return new Map(Array.from(aggregates, ([id, aggregate]) => [id, aggregateToHeat(aggregate)]));
}

function aggregatesToSummaryMap(aggregates: Map<string, TopicPoolWorkAggregate>) {
  return new Map(Array.from(aggregates, ([id, aggregate]) => [id, aggregateToSummary(aggregate)]));
}

export async function loadTopicPool(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
  options: TopicPoolQueryOptions,
): Promise<ApiResult<unknown>> {
  if (options.view === "trending") return loadScoredTopicPool(supabase, userId, scope, options, "trending");
  if (options.view === "high_potential") return loadScoredTopicPool(supabase, userId, scope, options, "high_potential");
  if (options.view === "never_worked") return loadNeverWorkedTopics(supabase, userId, scope, options);

  const from = (options.page - 1) * options.pageSize;
  const since = timeRangeStartIso(options.timeRange);
  let query = supabase
    .from("sub_topics")
    .select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)", { count: "exact" })
    .eq("library_status", "in_library")
    .order("created_at", { ascending: false });
  if (options.sourceType) query = query.eq("source_type", options.sourceType);
  if (options.durationRange) query = applyDurationRangeFilter(query, options.durationRange);

  // my_claims 视图：直接查 sub_topic_claims 获取用户的有效认领，不依赖 join 关联
  let myClaimsDirectMap: Map<string, CurrentUserClaim> | null = null;
  if (options.view === "my_claims") {
    const { data: myClaimsRows, error: myClaimsError } = await supabase
      .from("sub_topic_claims")
      .select("id, sub_topic_id, status, claimed_at")
      .eq("user_id", userId)
      .eq("status", "writing");
    if (myClaimsError) return { ok: false, status: 500, message: myClaimsError.message };

    myClaimsDirectMap = new Map();
    const claimedIds: string[] = [];
    for (const row of (myClaimsRows ?? []) as Array<{ id?: unknown; sub_topic_id?: unknown; status?: unknown; claimed_at?: unknown }>) {
      const subTopicId = typeof row.sub_topic_id === "string" ? row.sub_topic_id : null;
      const claimId = typeof row.id === "string" ? row.id : null;
      if (!subTopicId || !claimId || row.status !== "writing") continue;
      claimedIds.push(subTopicId);
      const existing = myClaimsDirectMap.get(subTopicId);
      if (!existing) {
        myClaimsDirectMap.set(subTopicId, {
          id: claimId,
          subTopicId,
          status: "writing",
          claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
        });
      }
    }

    const uniqueClaimedIds = [...new Set(claimedIds)];
    if (uniqueClaimedIds.length === 0) {
      return {
        ok: true,
        value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } },
      };
    }
    query = query.in("id", uniqueClaimedIds);
  } else {
    // 全部 / 我提交的：时间范围只限制子题录入时间；all 代表全部历史。
    if (since) query = query.gte("created_at", since);
  }

  if (options.topicIds.length > 0) {
    query = query.in("topic_id", options.topicIds);
  }
  if (options.view === "my_created") query = query.eq("created_by", userId);

  const { data, error } = await measureAsync("topics.pool.items", () => query);
  if (error) return { ok: false, status: 500, message: error.message };

  const items = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((item) => matchesTopicPoolQuery(item, options.q));

  const aggregates = await tryLoadTopicPoolAggregates(supabase, scope);

  let heat: Map<string, Recent7dHeat>;
  if (aggregates) {
    heat = aggregatesToHeatMap(aggregates);
  } else {
    try {
      heat = await measureAsync("topics.pool.heat", () => loadRecent7dHeat(supabase, items.map((item) => String(item.id))));
    } catch (error) {
      return { ok: false, status: 500, message: error instanceof Error ? error.message : "七天热度加载失败" };
    }
  }

  let summaries: Map<string, TopicWorkSummary>;
  if (aggregates) {
    summaries = aggregatesToSummaryMap(aggregates);
  } else {
    try {
      summaries = await measureAsync("topics.pool.summaries", () =>
        loadTopicSummaries(supabase, items.map((item) => String(item.id)), scope),
      );
    } catch (error) {
      return { ok: false, status: 500, message: error instanceof Error ? error.message : "选题汇总加载失败" };
    }
  }
  const builtItems = items.map((item) => buildTopicPoolItem(
    item,
    userId,
    scope,
    summaries.get(String(item.id)) ?? calculateTopicWorkSummary([]),
    recent7dHeatExtra(heat, String(item.id)),
  ));

  // 更多筛选中的近 7 天热度与历史成绩基于真实计算值后置过滤
  const visibleItems = options.recentHeat || options.performance
    ? builtItems.filter((item) => matchesPostFilters(item as Record<string, unknown>, options))
    : builtItems;

  // my_claims 视图：用直接查到的 claim 数据覆盖 join 关联的结果
  if (myClaimsDirectMap) {
    for (const item of visibleItems) {
      const directClaim = myClaimsDirectMap.get(String((item as Record<string, unknown>).id));
      if (directClaim) {
        (item as Record<string, unknown>).myClaim = directClaim;
      }
    }
  }
  const sortedItems = options.sort
    ? sortTopicPoolItems(visibleItems as Array<SortableTopicPoolItem & Record<string, unknown>>, options.sort)
    : visibleItems;
  const pageItems = sortedItems.slice(from, from + options.pageSize);

  return {
    ok: true,
    value: {
      items: pageItems,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: sortedItems.length,
      },
    },
  };
}

/**
 * 选题库首屏读取：一次权限确认后并行准备首屏所需的只读数据，避免客户端
 * 分别请求 active、options、pool 和 my_claims，导致相同的权限与统计工作重复执行。
 */
export async function loadTopicLibraryBootstrap(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
): Promise<ApiResult<{
  active: unknown;
  options: { topics: TopicOption[] };
  pool: unknown;
  myWritingTopicIds: string[];
  currentUserId: string;
}>> {
  const [active, options, pool, writingRowsResult] = await Promise.all([
    loadActiveTopics(supabase, userId, scope, 8),
    loadTopicOptions(supabase),
    loadTopicPool(supabase, userId, scope, {
      view: "all",
      timeRange: "all",
      topicIds: [],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    measureAsync("topics.bootstrap.myWritingIds", async () =>
      supabase
        .from("sub_topic_claims")
        .select("sub_topic_id")
        .eq("user_id", userId)
        .eq("status", "writing"),
    ),
  ]);

  if (!active.ok) return active;
  if (!options.ok) return options;
  if (!pool.ok) return pool;
  if (writingRowsResult.error) {
    return { ok: false, status: 500, message: writingRowsResult.error.message };
  }

  const myWritingTopicIds = Array.from(new Set(
    ((writingRowsResult.data ?? []) as Array<{ sub_topic_id?: unknown }>)
      .map((row) => row.sub_topic_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  return {
    ok: true,
    value: {
      active: active.value,
      options: options.value,
      pool: pool.value,
      myWritingTopicIds,
      currentUserId: userId,
    },
  };
}

export async function loadTopicSummaries(supabase: TopicSupabase, subTopicIds: string[], scope: DataAccessScope) {
  const summaryMap = new Map<string, TopicWorkSummary>();
  if (!subTopicIds.length) return summaryMap;

  const data = await fetchAllQueryPages<Record<string, unknown> & { user_id?: string | null }>(
    (from, to) => {
      let query = supabase
        .from("videos")
        .select("topic_id, user_id, content, uploaded_at, video_metrics_snapshots(play_count)")
        .eq("lifecycle_state", "active")
        .in("topic_id", subTopicIds);
      if (scope.kind !== "all") query = query.in("user_id", scope.visibleUserIds);
      return query
        .order("uploaded_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
    },
    "加载选题汇总失败",
  );

  return summarizeScopedWorksBySubTopic(data, scope);
}

type ScopedWorkRow = Record<string, unknown> & { user_id?: string | null };

function summarizeScopedWorksBySubTopic(rows: ScopedWorkRow[], scope: DataAccessScope) {
  const rowsBySubTopic = new Map<string, TopicWorkMetricInput[]>();
  for (const row of applyScope(rows, scope)) {
    const subTopicId = String(row.topic_id ?? "");
    if (!subTopicId) continue;
    const snapshots = Array.isArray(row.video_metrics_snapshots)
      ? row.video_metrics_snapshots as Array<{ play_count?: number | null }>
      : [];
    const playCount = snapshots.reduce((max, snapshot) => Math.max(max, Number(snapshot.play_count ?? 0)), 0);
    const list = rowsBySubTopic.get(subTopicId) ?? [];
    list.push({
      playCount,
      content: typeof row.content === "string" ? row.content : null,
      uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
    });
    rowsBySubTopic.set(subTopicId, list);
  }

  const summaryMap = new Map<string, TopicWorkSummary>();
  for (const [subTopicId, workRows] of rowsBySubTopic) {
    const summary = calculateTopicWorkSummary(workRows);
    summary.internalMetrics = computeInternalMetrics(workRows);
    summaryMap.set(subTopicId, summary);
  }
  return summaryMap;
}

function filterRemovedSubTopicRows(rows: unknown[]) {
  return (rows as Array<Record<string, unknown>>).filter((row) => {
    const subTopic = Array.isArray(row.sub_topics) ? row.sub_topics[0] : row.sub_topics;
    return (subTopic as { library_status?: string } | null)?.library_status !== "removed";
  });
}

export interface Recent7dHeat {
  completedCount: number;
  inProgressCount: number;
  participants: number;
}

/**
 * 七天热度唯一口径（纯函数）：
 * - completedCount：近 7 天内提交过该选题关联作品的去重成员数；
 * - inProgressCount：近 7 天内开始写且目前仍在写的去重成员数；
 * - participants：两者并集去重（同一成员同时命中只算 1 人）。
 */
export function computeRecent7dHeat(
  works: Array<{ subTopicId: string; userId: string | null }>,
  writings: Array<{ subTopicId: string; userId: string | null }>,
): Map<string, Recent7dHeat> {
  const completed = new Map<string, Set<string>>();
  for (const work of works) {
    if (!work.subTopicId || !work.userId) continue;
    const set = completed.get(work.subTopicId) ?? new Set<string>();
    set.add(work.userId);
    completed.set(work.subTopicId, set);
  }
  const writing = new Map<string, Set<string>>();
  for (const row of writings) {
    if (!row.subTopicId || !row.userId) continue;
    const set = writing.get(row.subTopicId) ?? new Set<string>();
    set.add(row.userId);
    writing.set(row.subTopicId, set);
  }

  const heat = new Map<string, Recent7dHeat>();
  const ids = new Set([...completed.keys(), ...writing.keys()]);
  for (const id of ids) {
    const completedSet = completed.get(id) ?? new Set<string>();
    const writingSet = writing.get(id) ?? new Set<string>();
    heat.set(id, {
      completedCount: completedSet.size,
      inProgressCount: writingSet.size,
      participants: new Set([...completedSet, ...writingSet]).size,
    });
  }
  return heat;
}

/** 七天热度数据源：作品按全量成员统计（身份仍受 scope 控制在认领明细里），写作按真实 writing 记录统计。 */
export async function loadRecent7dHeat(supabase: TopicSupabase, subTopicIds: string[]): Promise<Map<string, Recent7dHeat>> {
  if (!subTopicIds.length) return new Map();
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [works, writings] = await Promise.all([
    fetchAllQueryPages<{ topic_id?: string | null; user_id?: string | null }>(
      (from, to) =>
        supabase
          .from("videos")
          .select("topic_id, user_id")
          .eq("lifecycle_state", "active")
          .gte("uploaded_at", sinceIso)
          .in("topic_id", subTopicIds)
          .order("id", { ascending: true })
          .range(from, to),
      "加载近7天作品失败",
    ),
    fetchAllQueryPages<{ sub_topic_id?: string | null; user_id?: string | null }>(
      (from, to) =>
        supabase
          .from("sub_topic_claims")
          .select("sub_topic_id, user_id")
          .eq("status", "writing")
          .gte("claimed_at", sinceIso)
          .in("sub_topic_id", subTopicIds)
          .order("id", { ascending: true })
          .range(from, to),
      "加载近7天写作记录失败",
    ),
  ]);

  return computeRecent7dHeat(
    works.map((row) => ({
      subTopicId: typeof row.topic_id === "string" ? row.topic_id : "",
      userId: typeof row.user_id === "string" ? row.user_id : null,
    })),
    writings.map((row) => ({
      subTopicId: typeof row.sub_topic_id === "string" ? row.sub_topic_id : "",
      userId: typeof row.user_id === "string" ? row.user_id : null,
    })),
  );
}

function recent7dHeatExtra(heat: Map<string, Recent7dHeat>, subTopicId: string) {
  const entry = heat.get(subTopicId);
  return {
    recent7dCompletedCount: entry?.completedCount ?? 0,
    recent7dInProgressCount: entry?.inProgressCount ?? 0,
    recent7dParticipants: entry?.participants ?? 0,
  };
}

export type TopicPoolWorkAggregate = {
  workCount: number;
  internalBestPlay: number | null;
  internalAvgPlay: number | null;
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
  latestUploadedAt: string | null;
  completedCount: number;
  inProgressCount: number;
  participants: number;
};

/**
 * 选题池聚合 RPC（20260830120000_topics_pool_aggregates）：一次调用拿到全部 in_library
 * 子题的内部成绩/达标汇总/最新作品时间/近 7 天热度，替代三条 pool 路径各自的作品全量扫描。
 * 拉不到 RPC 时（迁移未执行等）由调用方回退到原内存聚合路径，语义一致。
 */
export async function loadTopicPoolWorkAggregates(
  supabase: TopicSupabase,
  scope: DataAccessScope,
): Promise<Map<string, TopicPoolWorkAggregate>> {
  const { data, error } = await supabase.rpc("topics_pool_aggregates", {
    p_visible_user_ids: scope.kind === "all" ? null : scope.visibleUserIds,
  });
  if (error) throw new Error(error.message);
  const map = new Map<string, TopicPoolWorkAggregate>();
  for (const [topicId, payload] of Object.entries((data ?? {}) as Record<string, TopicPoolWorkAggregate>)) {
    if (!payload || typeof payload !== "object") continue;
    map.set(topicId, {
      workCount: Number(payload.workCount ?? 0),
      internalBestPlay: payload.internalBestPlay ?? null,
      internalAvgPlay: payload.internalAvgPlay ?? null,
      qualifiedWorkCount: Number(payload.qualifiedWorkCount ?? 0),
      averagePlayCount: payload.averagePlayCount ?? null,
      bestPlayCount: payload.bestPlayCount ?? null,
      bestCopy: payload.bestCopy ?? null,
      latestCopy: payload.latestCopy ?? null,
      latestUploadedAt: payload.latestUploadedAt ?? null,
      completedCount: Number(payload.completedCount ?? 0),
      inProgressCount: Number(payload.inProgressCount ?? 0),
      participants: Number(payload.participants ?? 0),
    });
  }
  return map;
}

function aggregateToSummary(aggregate: TopicPoolWorkAggregate): TopicWorkSummary {
  return {
    qualifiedWorkCount: aggregate.qualifiedWorkCount,
    averagePlayCount: aggregate.averagePlayCount,
    bestPlayCount: aggregate.bestPlayCount,
    bestCopy: aggregate.bestCopy,
    latestCopy: aggregate.latestCopy,
    internalMetrics: {
      bestPlayCount: aggregate.internalBestPlay,
      averagePlayCount: aggregate.internalAvgPlay,
      qualifiedWorkCount: aggregate.qualifiedWorkCount,
      workCount: aggregate.workCount,
    },
  };
}

function aggregateToHeat(aggregate: TopicPoolWorkAggregate): Recent7dHeat {
  return {
    completedCount: aggregate.completedCount,
    inProgressCount: aggregate.inProgressCount,
    participants: aggregate.participants,
  };
}

// 只服务选题库顶部的「团队动态」条：最新认领 + 最新成片。
// 旧的 focusTopics / worthRedoing / recentlyCreated 已随「今日聚焦」卡片下线一并删除，不要复活。
export async function loadActiveTopics(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
  limit = 8,
): Promise<ApiResult<unknown>> {
  type TaskResult<T> = { ok: true; data: T } | ApiFailure;

  const claimsTask = measureAsync("topics.active.claims", async (): Promise<TaskResult<unknown[]>> => {
    let claimsQuery = supabase
      .from("sub_topic_claims")
      .select("id, sub_topic_id, user_id, status, claimed_at, profiles(name), sub_topics(id, title, library_status)")
      .eq("status", "writing")
      .order("claimed_at", { ascending: false })
      .limit(limit);
    if (scope.kind !== "all") claimsQuery = claimsQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await claimsQuery;
    if (error) return { ok: false, status: 500, message: error.message };
    return { ok: true, data: filterRemovedSubTopicRows(data ?? []) };
  });

  const recentWorksTask = measureAsync("topics.active.recentWorks", async (): Promise<TaskResult<unknown[]>> => {
    let worksQuery = supabase
      .from("videos")
      .select("id, topic_id, user_id, video_title, uploaded_at, sub_topics!videos_topic_id_fkey(id, title, library_status)")
      .eq("lifecycle_state", "active")
      .not("topic_id", "is", null)
      .order("uploaded_at", { ascending: false })
      .limit(limit);
    if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await worksQuery;
    if (error) return { ok: false, status: 500, message: error.message };
    return { ok: true, data: filterRemovedSubTopicRows(data ?? []) };
  });

  const [claimsResult, recentWorksResult] = await Promise.all([claimsTask, recentWorksTask]);
  if (!claimsResult.ok) return claimsResult;
  if (!recentWorksResult.ok) return { ...recentWorksResult, message: "加载最近作品失败" };

  return {
    ok: true,
    value: {
      recentlyClaimed: claimsResult.data,
      recentlyWorked: recentWorksResult.data,
    },
  };
}

export async function loadSubTopicClaimActivity(
  supabase: TopicSupabase,
  subTopicId: string,
  scope: DataAccessScope,
): Promise<ApiResult<unknown>> {
  // 写作动态与 7 天热度两查互不依赖，并行取（2026-08-30）
  const [claimsResult, heatResult] = await Promise.all([
    supabase
      .from("sub_topic_claims")
      .select("user_id, status, claimed_at, profiles(name)")
      .eq("sub_topic_id", subTopicId)
      .eq("status", "writing"),
    loadRecent7dHeat(supabase, [subTopicId]),
  ]);
  if (claimsResult.error) return { ok: false, status: 500, message: "加载写作动态失败" };

  // 详情页的 7 天热度三值由服务端按唯一口径计算，前端不做本地推算
  let recent7dSummary: Recent7dHeat | null = null;
  try {
    recent7dSummary = heatResult.get(subTopicId) ?? { completedCount: 0, inProgressCount: 0, participants: 0 };
  } catch {
    recent7dSummary = null;
  }

  return {
    ok: true,
    value: {
      ...(buildClaimActivity(((claimsResult.data ?? []) as Array<Record<string, unknown> & { user_id?: string | null; status?: string | null; claimed_at?: string | null }>), scope)),
      recent7dSummary,
    },
  };
}

export async function loadSubTopicWorks(
  supabase: TopicSupabase,
  id: string,
  scope: DataAccessScope,
  options: { sort: TopicWorkSort; page: number; pageSize: number },
  preloadedSubTopic?: { topic_id: string | null; group_id: string | null; library_status: string | null },
  options2?: { includeSimilar?: boolean },
): Promise<ApiResult<unknown>> {
  const includeSimilar = options2?.includeSimilar ?? true;
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  // detail 链路传入已取出的子题行，省一次重复查询；独立 /works 入口仍自行查询
  let subTopic: { topic_id?: string | null; group_id?: string | null; library_status?: string | null } | null;
  if (preloadedSubTopic) {
    subTopic = preloadedSubTopic;
  } else {
    const { data, error: subTopicError } = await supabase
      .from("sub_topics")
      .select("id, topic_id, group_id, library_status")
      .eq("id", id)
      .maybeSingle();
    if (subTopicError) return { ok: false, status: 500, message: subTopicError.message };
    subTopic = data as { topic_id?: string | null; group_id?: string | null; library_status?: string | null } | null;
  }
  if (!subTopic) return { ok: false, status: 404, message: "子题不存在" };
  if (subTopic.library_status === "removed") {
    return { ok: false, status: 404, message: "该选题已被管理员移出选题库" };
  }

  // 同组子题查询只依赖 topic_id/group_id，与直接作品查询并行
  const siblingsPromise = (async () => {
    const groupId = subTopic?.group_id;
    const topicId = subTopic?.topic_id;
    if (!groupId || !topicId) return [] as Array<{ id: string }>;
    return fetchAllQueryPages<{ id: string }>(
      (from, to) =>
        supabase
          .from("sub_topics")
          .select("id")
          .eq("topic_id", topicId)
          .eq("group_id", groupId)
          .neq("id", id)
          .order("id", { ascending: true })
          .range(from, to),
      "加载同组选题失败",
    );
  })();

  let directRows: unknown[] = [];
  let siblings: Array<{ id: string }> = [];
  try {
    const [rows, siblingsResult] = await Promise.all([
      fetchAllQueryPages<Record<string, unknown>>(
        (pageFrom, pageTo) => {
          let directQuery = supabase
            .from("videos")
            .select("id, topic_id, user_id, video_title, content, published_at, uploaded_at, profiles!videos_user_id_fkey(name), video_metrics_snapshots(play_count, likes, comments, shares, favorites, follower_gain, follower_convert)")
            .eq("lifecycle_state", "active")
            .eq("topic_id", id);
          if (scope.kind !== "all") directQuery = directQuery.in("user_id", scope.visibleUserIds);
          return directQuery
            .order("uploaded_at", { ascending: false })
            .order("id", { ascending: true })
            .range(pageFrom, pageTo);
        },
        "加载选题作品失败",
      ),
      siblingsPromise,
    ]);
    directRows = rows;
    siblings = siblingsResult;
  } catch (error) {
    return { ok: false, status: 500, message: error instanceof Error ? error.message : "加载选题作品失败" };
  }

  let similarRows: unknown[] = [];
  const siblingIds = includeSimilar ? siblings.map((row) => row.id) : [];
  if (siblingIds.length) {
    let similarQuery = supabase
      .from("videos")
      .select("id, topic_id, user_id, video_title, content, published_at, uploaded_at, profiles!videos_user_id_fkey(name), video_metrics_snapshots(play_count)")
      .eq("lifecycle_state", "active")
      .in("topic_id", siblingIds);
    if (scope.kind !== "all") similarQuery = similarQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await similarQuery.limit(20);
    if (error) return { ok: false, status: 500, message: error.message };
    similarRows = data ?? [];
  }

  const withAuthorName = (row: Record<string, unknown>) => {
    const profileName = (row.profiles as { name?: unknown } | null)?.name;
    return {
      ...row,
      user_name: typeof profileName === "string" ? profileName : null,
    };
  };

  const rows: Array<Record<string, unknown> & { referenceType: "direct" }> = [
    ...((directRows ?? []) as Array<Record<string, unknown>>),
  ].map((row) => ({ ...withAuthorName(row), referenceType: "direct" }));
  const sorted = rows.sort((a, b) => {
    if (options.sort === "recent") {
      return (Date.parse(String(b.uploaded_at ?? "")) || 0) - (Date.parse(String(a.uploaded_at ?? "")) || 0);
    }
    const aPlay = Array.isArray(a.video_metrics_snapshots) ? Number((a.video_metrics_snapshots[0] as { play_count?: number } | undefined)?.play_count ?? 0) : 0;
    const bPlay = Array.isArray(b.video_metrics_snapshots) ? Number((b.video_metrics_snapshots[0] as { play_count?: number } | undefined)?.play_count ?? 0) : 0;
    return bPlay - aPlay;
  });

  return {
    ok: true,
    value: {
      items: sorted.slice(from, to + 1),
      similarReferences: (similarRows as Array<Record<string, unknown>>).map((row) => ({ ...withAuthorName(row), referenceType: "similar" })),
      summary: calculateTopicWorkSummary(
        rows.map((row) => ({
          playCount: Array.isArray(row.video_metrics_snapshots)
            ? Number((row.video_metrics_snapshots[0] as { play_count?: number } | undefined)?.play_count ?? 0)
            : 0,
          content: typeof row.content === "string" ? row.content : null,
          uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
        })),
      ),
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: rows.length,
      },
    },
  };
}

export async function suggestSubTopics(
  supabase: TopicSupabase,
  input: { title: string; content: string },
): Promise<ApiResult<RankedSubTopicSuggestion[]>> {
  const title = normalizeText(input.title, 200) ?? "";
  const content = normalizeText(input.content, 2000) ?? "";
  if (!title && !content) return { ok: false, status: 400, message: "title 或 content 至少填一个" };

  const { data, error } = await supabase
    .from("sub_topics")
    .select("id, title, hook, topics(name), topic_groups(name)")
    .eq("library_status", "in_library")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, status: 500, message: error.message };

  const candidates = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    hook: String(row.hook ?? ""),
    topicName: typeof (row.topics as { name?: unknown } | null)?.name === "string" ? String((row.topics as { name: string }).name) : null,
    groupName: typeof (row.topic_groups as { name?: unknown } | null)?.name === "string" ? String((row.topic_groups as { name: string }).name) : null,
  }));

  return { ok: true, value: rankSuggestedSubTopics(candidates, { title, content }) };
}
