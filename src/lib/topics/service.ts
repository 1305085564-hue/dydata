import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { measureAsync } from "@/lib/perf";

export const TOPIC_POOL_VIEWS = [
  "all",
  "my_claims",
  "my_created",
  "trending",
  "high_potential",
  "never_worked",
] as const;
export const TOPIC_TIME_RANGES = ["3d", "1w", "1m", "3m", "all"] as const;
export const TOPIC_CLAIM_STATUSES = ["candidate", "scripting", "returned"] as const;
export const TOPIC_WORK_SORTS = ["best", "recent"] as const;
export const TOPIC_POOL_SORTS = ["latest", "avg_play", "claim_count"] as const;
export const TOPIC_COMPARISON_DIMENSIONS = ["topic", "account"] as const;

export type TopicPoolView = (typeof TOPIC_POOL_VIEWS)[number];
export type TopicTimeRange = (typeof TOPIC_TIME_RANGES)[number];
export type TopicClaimStatus = (typeof TOPIC_CLAIM_STATUSES)[number];
export type TopicWorkSort = (typeof TOPIC_WORK_SORTS)[number];
export type TopicPoolSort = (typeof TOPIC_POOL_SORTS)[number];
export type TopicComparisonDimension = (typeof TOPIC_COMPARISON_DIMENSIONS)[number];

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
}

export interface TopicPoolQueryOptions {
  view: TopicPoolView;
  timeRange: TopicTimeRange;
  topicIds: string[];
  page: number;
  pageSize: number;
  q?: string | null;
  sort?: TopicPoolSort;
}

export interface TopicComparisonQueryOptions {
  dimension: TopicComparisonDimension;
  days: number;
  topicId: string | null;
}

export interface TopicComparisonInputRow {
  topicId: string;
  topicName: string;
  accountId: string | null;
  accountName: string | null;
  playCount: number;
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

const MAX_CANDIDATE_CLAIMS = 5;
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
    return { ok: false, status: 400, message: "sort 只能是 latest、avg_play 或 claim_count" };
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
    },
  };
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

export function buildTopicComparisonQueryOptions(searchParams: URLSearchParams):
  | { ok: true; options: TopicComparisonQueryOptions }
  | ApiFailure {
  const dimension = searchParams.get("dimension") ?? "topic";
  if (!isOneOf(TOPIC_COMPARISON_DIMENSIONS, dimension)) {
    return { ok: false, status: 400, message: "dimension 只能是 topic 或 account" };
  }

  const rawDays = searchParams.get("days");
  const days = rawDays === null ? 30 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { ok: false, status: 400, message: "days 必须是 1 到 90 之间的整数" };
  }

  const topicId = searchParams.get("topicId")?.trim() || null;
  if (topicId && !isUuidLike(topicId)) {
    return { ok: false, status: 400, message: "topicId 格式不正确" };
  }

  return { ok: true, options: { dimension, days, topicId } };
}

export function validateCandidateClaimLimit(input: { currentCandidateCount: number; alreadyCandidate: boolean }) {
  if (input.alreadyCandidate || input.currentCandidateCount < MAX_CANDIDATE_CLAIMS) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    status: 409,
    message: "候选选题最多保留 5 条，请先放回一个选题",
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
  const candidateCount = rows.filter((row) => row.status === "candidate").length;
  const scriptingCount = rows.filter((row) => row.status === "scripting").length;
  const claims = applyScope(rows, scope)
    .filter((row) => row.status === "candidate" || row.status === "scripting")
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const displayName = typeof (profile as { name?: unknown } | null)?.name === "string"
        ? (profile as { name: string }).name
        : "未命名成员";
      return {
        userId: String(row.user_id),
        displayName,
        status: row.status as Extract<TopicClaimStatus, "candidate" | "scripting">,
        claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
      };
    })
    .sort((a, b) => {
      const statusOrder = Number(b.status === "scripting") - Number(a.status === "scripting");
      if (statusOrder !== 0) return statusOrder;
      return (Date.parse(b.claimedAt ?? "") || 0) - (Date.parse(a.claimedAt ?? "") || 0);
    });

  return { claims, candidateCount, scriptingCount };
}

export function buildTopicComparisonRows(rows: TopicComparisonInputRow[], dimension: TopicComparisonDimension) {
  const aggregates = new Map<string, TopicComparisonInputRow[]>();
  for (const row of rows) {
    const key = dimension === "topic" ? row.topicId : `${row.topicId}:${row.accountId ?? "unassigned"}`;
    const current = aggregates.get(key) ?? [];
    current.push(row);
    aggregates.set(key, current);
  }

  return [...aggregates.values()]
    .map((items) => {
      const first = items[0]!;
      const workCount = items.length;
      const qualifiedCount = items.filter((item) => item.playCount >= 30_000).length;
      const totalPlayCount = items.reduce((total, item) => total + item.playCount, 0);
      const base = {
        topicId: first.topicId,
        topicName: first.topicName,
        workCount,
        qualifiedCount,
        qualifiedRate: workCount ? qualifiedCount / workCount : 0,
        avgPlayCount: workCount ? Math.round(totalPlayCount / workCount) : 0,
        bestPlayCount: Math.max(...items.map((item) => item.playCount)),
        lowConfidence: workCount < 3,
      };
      return dimension === "account"
        ? { ...base, accountId: first.accountId, accountName: first.accountName }
        : base;
    })
    .sort(
      (a, b) =>
        b.qualifiedRate - a.qualifiedRate ||
        b.avgPlayCount - a.avgPlayCount ||
        b.workCount - a.workCount ||
        a.topicName.localeCompare(b.topicName, "zh-Hans-CN"),
    );
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

export async function claimSubTopic(supabase: TopicSupabase, userId: string, subTopicId: string): Promise<ApiResult<unknown>> {
  const { data: existing, error: existingError } = await supabase
    .from("sub_topic_claims")
    .select("*")
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .in("status", ["candidate", "scripting"])
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message };

  const status = (existing as { status?: string } | null)?.status;
  const { count, error: countError } = await supabase
    .from("sub_topic_claims")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "candidate");
  if (countError) return { ok: false, status: 500, message: countError.message };

  const limit = validateCandidateClaimLimit({
    currentCandidateCount: count ?? 0,
    alreadyCandidate: status === "candidate",
  });
  if (!limit.ok) return limit;
  if (existing) return { ok: true, value: existing };

  const { data, error } = await supabase
    .from("sub_topic_claims")
    .insert({ sub_topic_id: subTopicId, user_id: userId, status: "candidate" })
    .select("*")
    .single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, value: data };
}

export async function replaceSubTopicClaim(
  supabase: TopicSupabase,
  userId: string,
  returnedSubTopicId: string,
  targetSubTopicId: string,
): Promise<ApiResult<unknown>> {
  if (!returnedSubTopicId || !targetSubTopicId || returnedSubTopicId === targetSubTopicId) {
    return { ok: false, status: 400, message: "替换选题参数不合法" };
  }
  const { data: oldClaim, error: oldError } = await supabase.from("sub_topic_claims")
    .select("id, status").eq("sub_topic_id", returnedSubTopicId).eq("user_id", userId)
    .in("status", ["candidate", "scripting"]).maybeSingle();
  if (oldError) return { ok: false, status: 500, message: oldError.message };
  if (!oldClaim) return { ok: false, status: 404, message: "未找到可替换的原认领" };
  if ((oldClaim as { status?: string }).status !== "candidate") {
    return { ok: false, status: 409, message: "脚本中的选题不能替换，请先放回或完成脚本" };
  }
  const { data: targetClaim, error: targetError } = await supabase.from("sub_topic_claims")
    .select("id").eq("sub_topic_id", targetSubTopicId).eq("user_id", userId)
    .in("status", ["candidate", "scripting"]).maybeSingle();
  if (targetError) return { ok: false, status: 500, message: targetError.message };
  if (targetClaim) return { ok: false, status: 409, message: "目标选题已被认领" };
  const { count, error: countError } = await supabase.from("sub_topic_claims")
    .select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "candidate");
  if (countError) return { ok: false, status: 500, message: countError.message };
  const effectiveCount = Math.max(0, (count ?? 0) - ((oldClaim as { status: string }).status === "candidate" ? 1 : 0));
  const limit = validateCandidateClaimLimit({ currentCandidateCount: effectiveCount, alreadyCandidate: false });
  if (!limit.ok) return limit;
  const { data: inserted, error: insertError } = await supabase.from("sub_topic_claims")
    .insert({ sub_topic_id: targetSubTopicId, user_id: userId, status: "candidate" }).select("*").single();
  if (insertError || !inserted) return { ok: false, status: 409, message: insertError?.message || "认领新选题失败" };
  const { data: returned, error: returnError } = await supabase.from("sub_topic_claims")
    .update({ status: "returned", returned_at: new Date().toISOString() })
    .eq("sub_topic_id", returnedSubTopicId).eq("user_id", userId).in("status", ["candidate", "scripting"]).select("*").maybeSingle();
  if (!returnError && returned) return { ok: true, value: { claim: inserted, returned } };
  await supabase.from("sub_topic_claims").delete().eq("id", (inserted as { id: string }).id);
  return { ok: false, status: 409, message: "放回原选题失败，已撤销新认领" };
}

export async function changeClaimStatus(
  supabase: TopicSupabase,
  userId: string,
  subTopicId: string,
  status: Extract<TopicClaimStatus, "scripting" | "returned">,
): Promise<ApiResult<unknown>> {
  const patch = status === "returned" ? { status, returned_at: new Date().toISOString() } : { status, returned_at: null };
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .update(patch)
    .eq("sub_topic_id", subTopicId)
    .eq("user_id", userId)
    .neq("status", "returned")
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, status: 500, message: error.message };
  if (!data) return { ok: false, status: 404, message: "未找到可流转的认领记录" };
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
  status: Extract<TopicClaimStatus, "candidate" | "scripting">;
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
      (row.status === "candidate" || row.status === "scripting") &&
      typeof row.id === "string"
    ))
    .sort((left, right) => {
      const statusOrder = Number(right.status === "scripting") - Number(left.status === "scripting");
      if (statusOrder !== 0) return statusOrder;
      return (Date.parse(String(right.claimed_at ?? "")) || 0) - (Date.parse(String(left.claimed_at ?? "")) || 0);
    })[0];

  if (!match || typeof match.id !== "string" || typeof match.status !== "string") return null;
  return {
    id: match.id,
    subTopicId,
    status: match.status as Extract<TopicClaimStatus, "candidate" | "scripting">,
    claimedAt: typeof match.claimed_at === "string" ? match.claimed_at : null,
  };
}

type SortableTopicPoolItem = {
  id: string;
  created_at?: string | null;
  title?: string | null;
  hook?: string | null;
  claimCount?: number;
  summary?: { averagePlayCount?: number | null } | null;
};

export function sortTopicPoolItems<T extends SortableTopicPoolItem>(items: T[], sort: TopicPoolSort): T[] {
  return [...items].sort((left, right) => {
    if (sort === "avg_play") {
      const difference = (right.summary?.averagePlayCount ?? 0) - (left.summary?.averagePlayCount ?? 0);
      if (difference !== 0) return difference;
    } else if (sort === "claim_count") {
      const difference = (right.claimCount ?? 0) - (left.claimCount ?? 0);
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
  const activeVisibleClaims = visibleClaims.filter((claim) => claim.status === "candidate" || claim.status === "scripting");
  return {
    ...item,
    id: String(item.id ?? ""),
    sub_topic_claims: visibleClaims,
    summary,
    myClaim: buildMyClaim(rawClaims, userId, String(item.id)),
    claimCount: activeVisibleClaims.length,
    candidateCount: activeVisibleClaims.filter((claim) => claim.status === "candidate").length,
    scriptingCount: activeVisibleClaims.filter((claim) => claim.status === "scripting").length,
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
    .order("created_at", { ascending: false });
  if (options.topicIds.length > 0) subTopicsQuery = subTopicsQuery.in("topic_id", options.topicIds);

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

  // content 一并取出，让汇总统计直接复用这次结果，省掉一次同表全量扫描
  let worksQuery = supabase
    .from("videos")
    .select("topic_id, user_id, content, uploaded_at, video_metrics_snapshots(play_count)")
    .eq("lifecycle_state", "active")
    .in("topic_id", subTopicIds);
  if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);

  const { data: works, error: worksError } = await measureAsync("topics.pool.scored.works", () => worksQuery);
  if (worksError) return { ok: false, status: 500, message: worksError.message };

  const worksBySubTopic = new Map<string, { latestUploadedAt: string; playCounts: number[] }>();
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

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const scored: Array<{
    item: Record<string, unknown>;
    score: number;
    daysSinceLastWork: number;
    avgPlayCount: number | null;
    bestPlayCount: number | null;
  }> = [];
  for (const item of allSubTopics) {
    const aggregate = worksBySubTopic.get(String(item.id));
    if (!aggregate) continue;
    const qualifiedPlayCounts = aggregate.playCounts.filter((playCount) => playCount >= 30_000);
    const avgPlayCount = qualifiedPlayCounts.length
      ? Math.round(qualifiedPlayCounts.reduce((total, playCount) => total + playCount, 0) / qualifiedPlayCounts.length)
      : null;
    const latestTimestamp = Date.parse(aggregate.latestUploadedAt);
    const daysSinceLastWork = Number.isFinite(latestTimestamp)
      ? Math.max(0, Math.floor((now - latestTimestamp) / millisecondsPerDay))
      : 999;
    if (mode === "trending" && daysSinceLastWork > 30) continue;
    if (mode === "high_potential" && daysSinceLastWork <= 30) continue;
    if (!matchesTopicPoolQuery(item, options.q)) continue;
    const maxPlayCount = qualifiedPlayCounts.length ? Math.max(...qualifiedPlayCounts) : null;
    scored.push({
      item,
      score: calcTopicScore(avgPlayCount, daysSinceLastWork, mode),
      daysSinceLastWork,
      avgPlayCount,
      bestPlayCount: maxPlayCount,
    });
  }

  scored.sort((left, right) => {
    if (options.sort === "avg_play") {
      return (right.avgPlayCount ?? 0) - (left.avgPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
    }
    if (options.sort === "claim_count") {
      const leftClaims = Array.isArray(left.item.sub_topic_claims)
        ? (left.item.sub_topic_claims as Array<{ user_id?: string | null; status?: string }>).filter((claim) => claim.status === "candidate" || claim.status === "scripting")
        : [];
      const rightClaims = Array.isArray(right.item.sub_topic_claims)
        ? (right.item.sub_topic_claims as Array<{ user_id?: string | null; status?: string }>).filter((claim) => claim.status === "candidate" || claim.status === "scripting")
        : [];
      return rightClaims.length - leftClaims.length || String(left.item.id).localeCompare(String(right.item.id));
    }
    if (options.sort === "latest") {
      return (Date.parse(String(right.item.created_at ?? "")) || 0) - (Date.parse(String(left.item.created_at ?? "")) || 0) || String(left.item.id).localeCompare(String(right.item.id));
    }
    return right.score - left.score || (right.avgPlayCount ?? 0) - (left.avgPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
  });

  const totalItems = scored.length;
  const from = (options.page - 1) * options.pageSize;
  const pageItems = scored.slice(from, from + options.pageSize);
  const summaries = summarizeScopedWorksBySubTopic((works ?? []) as ScopedWorkRow[], scope);

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
    .order("created_at", { ascending: false });
  if (options.topicIds.length > 0) subTopicsQuery = subTopicsQuery.in("topic_id", options.topicIds);

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

  let worksQuery = supabase
    .from("videos")
    .select("topic_id, user_id")
    .eq("lifecycle_state", "active")
    .in("topic_id", subTopicIds);
  if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);

  const { data: works, error: worksError } = await worksQuery;
  if (worksError) return { ok: false, status: 500, message: worksError.message };

  const workedIds = new Set(
    applyScope(
      (works ?? []) as Array<{ topic_id?: string | null; user_id?: string | null }>,
      scope,
    )
      .map((work) => work.topic_id)
      .filter((id): id is string => Boolean(id)),
  );
  const neverWorked = allSubTopics
    .filter((item) => !workedIds.has(String(item.id)))
    .filter((item) => matchesTopicPoolQuery(item, options.q));
  const builtItems = neverWorked.map((item) =>
    buildTopicPoolItem(item, userId, scope, calculateTopicWorkSummary([]), {
      _daysSinceLastWork: null,
      _avgPlayCount: null,
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

  const { data: claims, error: claimsError } = await supabase
    .from("sub_topic_claims")
    .select("id, sub_topic_id, user_id, status, claimed_at")
    .eq("sub_topic_id", id)
    .in("status", ["candidate", "scripting"])
    .order("claimed_at", { ascending: false });
  if (claimsError) return { ok: false, status: 500, message: claimsError.message };

  const claimRows = (claims ?? []) as Array<{
    id?: unknown;
    sub_topic_id?: unknown;
    user_id?: unknown;
    status?: unknown;
    claimed_at?: unknown;
  }>;
  const myClaim = buildMyClaim(claimRows, userId, id);

  const works = await loadSubTopicWorks(supabase, id, scope, { sort: "best", page: 1, pageSize: 20 });
  if (!works.ok) return works;
  return {
    ok: true,
    value: {
      subTopic: { ...subTopic, myClaim },
      works: works.value,
    },
  };
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
    .order("created_at", { ascending: false });

  // my_claims 视图：直接查 sub_topic_claims 获取用户的有效认领，不依赖 join 关联
  let myClaimsDirectMap: Map<string, CurrentUserClaim> | null = null;
  if (options.view === "my_claims") {
    const { data: myClaimsRows, error: myClaimsError } = await supabase
      .from("sub_topic_claims")
      .select("id, sub_topic_id, status, claimed_at")
      .eq("user_id", userId)
      .neq("status", "returned");
    if (myClaimsError) return { ok: false, status: 500, message: myClaimsError.message };

    myClaimsDirectMap = new Map();
    const claimedIds: string[] = [];
    for (const row of (myClaimsRows ?? []) as Array<{ id?: unknown; sub_topic_id?: unknown; status?: unknown; claimed_at?: unknown }>) {
      const subTopicId = typeof row.sub_topic_id === "string" ? row.sub_topic_id : null;
      const claimId = typeof row.id === "string" ? row.id : null;
      const status = row.status === "candidate" || row.status === "scripting" ? row.status : null;
      if (!subTopicId || !claimId || !status) continue;
      claimedIds.push(subTopicId);
      // 同一子题保留优先级最高的（scripting > candidate，时间最新）
      const existing = myClaimsDirectMap.get(subTopicId);
      if (!existing || (status === "scripting" && existing.status !== "scripting")) {
        myClaimsDirectMap.set(subTopicId, {
          id: claimId,
          subTopicId,
          status,
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

  let summaries: Map<string, TopicWorkSummary>;
  try {
    summaries = await measureAsync("topics.pool.summaries", () =>
      loadTopicSummaries(supabase, items.map((item) => String(item.id)), scope),
    );
  } catch (error) {
    return { ok: false, status: 500, message: error instanceof Error ? error.message : "选题汇总加载失败" };
  }
  const builtItems = items.map((item) => buildTopicPoolItem(
    item,
    userId,
    scope,
    summaries.get(String(item.id)) ?? calculateTopicWorkSummary([]),
  ));

  // my_claims 视图：用直接查到的 claim 数据覆盖 join 关联的结果
  if (myClaimsDirectMap) {
    for (const item of builtItems) {
      const directClaim = myClaimsDirectMap.get(String((item as Record<string, unknown>).id));
      if (directClaim) {
        (item as Record<string, unknown>).myClaim = directClaim;
      }
    }
  }
  const sortedItems = options.sort
    ? sortTopicPoolItems(builtItems as Array<SortableTopicPoolItem & Record<string, unknown>>, options.sort)
    : builtItems;
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

export async function loadTopicSummaries(supabase: TopicSupabase, subTopicIds: string[], scope: DataAccessScope) {
  const summaryMap = new Map<string, TopicWorkSummary>();
  if (!subTopicIds.length) return summaryMap;

  const { data, error } = await supabase
    .from("videos")
    .select("topic_id, user_id, content, uploaded_at, video_metrics_snapshots(play_count)")
    .eq("lifecycle_state", "active")
    .in("topic_id", subTopicIds);
  if (error) throw new Error(error.message);

  return summarizeScopedWorksBySubTopic(
    (data ?? []) as Array<Record<string, unknown> & { user_id?: string | null }>,
    scope,
  );
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
    summaryMap.set(subTopicId, calculateTopicWorkSummary(workRows));
  }
  return summaryMap;
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
      .select("*, profiles(name), sub_topics(id, title, hook, created_by, topics(id, name), topic_groups(id, name))")
      .neq("status", "returned")
      .order("claimed_at", { ascending: false })
      .limit(limit);
    if (scope.kind !== "all") claimsQuery = claimsQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await claimsQuery;
    if (error) return { ok: false, status: 500, message: error.message };
    return { ok: true, data: data ?? [] };
  });

  const recentWorksTask = measureAsync("topics.active.recentWorks", async (): Promise<TaskResult<unknown[]>> => {
    let worksQuery = supabase
      .from("videos")
      .select("id, topic_id, user_id, video_title, uploaded_at, sub_topics(id, title, hook, topics(id, name), topic_groups(id, name))")
      .eq("lifecycle_state", "active")
      .not("topic_id", "is", null)
      .order("uploaded_at", { ascending: false })
      .limit(limit);
    if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
    const { data, error } = await worksQuery;
    if (error) return { ok: false, status: 500, message: error.message };
    return { ok: true, data: data ?? [] };
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
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .select("user_id, status, claimed_at, profiles(name)")
    .eq("sub_topic_id", subTopicId)
    .neq("status", "returned");
  if (error) return { ok: false, status: 500, message: "加载认领动态失败" };

  return {
    ok: true,
    value: buildClaimActivity((data ?? []) as Array<Record<string, unknown> & { user_id?: string | null; status?: string | null; claimed_at?: string | null }>, scope),
  };
}

export async function loadTopicComparison(
  supabase: TopicSupabase,
  scope: DataAccessScope,
  options: TopicComparisonQueryOptions,
): Promise<ApiResult<unknown>> {
  const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString();
  let videosQuery = supabase
    .from("videos")
    .select("id, user_id, account_id, sub_topics!inner(topic_id, topics!inner(id, name)), accounts(id, name)")
    .eq("lifecycle_state", "active")
    .not("topic_id", "is", null)
    .gte("uploaded_at", since);
  if (scope.kind !== "all") videosQuery = videosQuery.in("user_id", scope.visibleUserIds);
  if (options.topicId) videosQuery = videosQuery.eq("sub_topics.topic_id", options.topicId);

  const { data: videos, error: videosError } = await measureAsync("topics.comparison.videos", () => videosQuery);
  if (videosError) return { ok: false, status: 500, message: "加载对比作品失败" };
  const videoRows = (videos ?? []) as Array<Record<string, unknown>>;
  const videoIds = videoRows.map((row) => String(row.id)).filter(Boolean);
  if (!videoIds.length) {
    return { ok: true, value: { dimension: options.dimension, windowDays: options.days, rows: [], sampleTotal: 0 } };
  }

  const { data: snapshots, error: snapshotsError } = await measureAsync("topics.comparison.snapshots", () => supabase
    .from("video_metrics_snapshots")
    .select("video_id, play_count, captured_at")
    .in("video_id", videoIds)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false }));
  if (snapshotsError) return { ok: false, status: 500, message: "加载播放数据失败" };

  const playCountByVideoId = new Map<string, number>();
  for (const snapshot of (snapshots ?? []) as Array<{ video_id?: string | null; play_count?: number | null }>) {
    if (!snapshot.video_id || playCountByVideoId.has(snapshot.video_id)) continue;
    playCountByVideoId.set(snapshot.video_id, Number(snapshot.play_count ?? 0));
  }

  const comparisonInputs: TopicComparisonInputRow[] = [];
  for (const video of videoRows) {
    const subTopic = Array.isArray(video.sub_topics) ? video.sub_topics[0] : video.sub_topics;
    const topic = Array.isArray((subTopic as { topics?: unknown } | null)?.topics)
      ? ((subTopic as { topics: Array<Record<string, unknown>> }).topics[0] ?? null)
      : (subTopic as { topics?: Record<string, unknown> | null } | null)?.topics ?? null;
    const account = Array.isArray(video.accounts) ? video.accounts[0] : video.accounts;
    const playCount = playCountByVideoId.get(String(video.id));
    if (!topic || playCount === undefined) continue;
    comparisonInputs.push({
      topicId: String((topic as { id?: string }).id ?? ""),
      topicName: String((topic as { name?: string }).name ?? "未分类"),
      accountId: typeof (account as { id?: unknown } | null)?.id === "string" ? (account as { id: string }).id : null,
      accountName: typeof (account as { name?: unknown } | null)?.name === "string" ? (account as { name: string }).name : null,
      playCount,
    });
  }

  const rows = buildTopicComparisonRows(comparisonInputs, options.dimension);
  return {
    ok: true,
    value: { dimension: options.dimension, windowDays: options.days, rows, sampleTotal: comparisonInputs.length },
  };
}

export async function loadSubTopicWorks(
  supabase: TopicSupabase,
  id: string,
  scope: DataAccessScope,
  options: { sort: TopicWorkSort; page: number; pageSize: number },
): Promise<ApiResult<unknown>> {
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  const { data: subTopic, error: subTopicError } = await supabase
    .from("sub_topics")
    .select("id, topic_id, group_id")
    .eq("id", id)
    .maybeSingle();
  if (subTopicError) return { ok: false, status: 500, message: subTopicError.message };
  if (!subTopic) return { ok: false, status: 404, message: "子题不存在" };

  let directQuery = supabase
      .from("videos")
      .select("id, topic_id, user_id, video_title, content, published_at, uploaded_at, video_metrics_snapshots(play_count, likes, comments, shares, favorites, follower_gain, follower_convert)")
      .eq("lifecycle_state", "active")
    .eq("topic_id", id);
  if (scope.kind !== "all") directQuery = directQuery.in("user_id", scope.visibleUserIds);
  const { data: directRows, error: directError } = await directQuery;
  if (directError) return { ok: false, status: 500, message: directError.message };

  let similarRows: unknown[] = [];
  const groupId = (subTopic as { group_id?: string | null }).group_id;
  const topicId = (subTopic as { topic_id?: string | null }).topic_id;
  if (groupId && topicId) {
    const { data: siblings, error: siblingError } = await supabase
      .from("sub_topics")
      .select("id")
      .eq("topic_id", topicId)
      .eq("group_id", groupId)
      .neq("id", id);
    if (siblingError) return { ok: false, status: 500, message: siblingError.message };
    const siblingIds = ((siblings ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (siblingIds.length) {
      let similarQuery = supabase
        .from("videos")
        .select("id, topic_id, user_id, video_title, content, published_at, uploaded_at, video_metrics_snapshots(play_count)")
        .eq("lifecycle_state", "active")
        .in("topic_id", siblingIds);
      if (scope.kind !== "all") similarQuery = similarQuery.in("user_id", scope.visibleUserIds);
      const { data, error } = await similarQuery.limit(20);
      if (error) return { ok: false, status: 500, message: error.message };
      similarRows = data ?? [];
    }
  }

  const rows: Array<Record<string, unknown> & { referenceType: "direct" }> = [
    ...((directRows ?? []) as Array<Record<string, unknown>>),
  ].map((row) => ({ ...row, referenceType: "direct" }));
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
      similarReferences: (similarRows as Array<Record<string, unknown>>).map((row) => ({ ...row, referenceType: "similar" })),
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
