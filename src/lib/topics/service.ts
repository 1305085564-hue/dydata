import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccessScope } from "@/lib/data-access-scope";

export const TOPIC_POOL_VIEWS = ["all", "my_claims", "my_created"] as const;
export const TOPIC_TIME_RANGES = ["3d", "1w", "1m", "3m"] as const;
export const TOPIC_CLAIM_STATUSES = ["candidate", "scripting", "returned"] as const;
export const TOPIC_WORK_SORTS = ["best", "recent"] as const;
export const TOPIC_COMPARISON_DIMENSIONS = ["topic", "account"] as const;

export type TopicPoolView = (typeof TOPIC_POOL_VIEWS)[number];
export type TopicTimeRange = (typeof TOPIC_TIME_RANGES)[number];
export type TopicClaimStatus = (typeof TOPIC_CLAIM_STATUSES)[number];
export type TopicWorkSort = (typeof TOPIC_WORK_SORTS)[number];
export type TopicComparisonDimension = (typeof TOPIC_COMPARISON_DIMENSIONS)[number];

type TopicSupabase = SupabaseClient;

export interface TopicGroupOption {
  id: string;
  name: string;
}

export interface SuggestedSubTopicCandidate {
  id: string;
  title: string;
  hook: string;
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
  bestCopy: string | null;
  latestCopy: string | null;
}

export interface TopicPoolQueryOptions {
  view: TopicPoolView;
  timeRange: TopicTimeRange;
  topicId: string | null;
  page: number;
  pageSize: number;
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
  return 90;
}

function timeRangeStartIso(range: TopicTimeRange, now = Date.now()) {
  return new Date(now - daysForTimeRange(range) * 24 * 60 * 60 * 1000).toISOString();
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
    return { ok: false, status: 400, message: "view 只能是 all、my_claims 或 my_created" };
  }

  const timeRange = searchParams.get("time_range") ?? "1m";
  if (!isOneOf(TOPIC_TIME_RANGES, timeRange)) {
    return { ok: false, status: 400, message: "time_range 只能是 3d、1w、1m 或 3m" };
  }

  const rawTopicId = searchParams.get("topic_id");
  const topicId = rawTopicId?.trim() || null;
  if (topicId && !isUuidLike(topicId)) {
    return { ok: false, status: 400, message: "topic_id 格式不正确" };
  }

  return {
    ok: true,
    options: {
      view,
      timeRange,
      topicId,
      page: normalizePositiveInteger(searchParams.get("page"), 1, 10000),
      pageSize: normalizePositiveInteger(searchParams.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
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
  const qualified = rows.filter((row) => (row.playCount ?? 0) >= 1000);
  const totalPlayCount = qualified.reduce((sum, row) => sum + (row.playCount ?? 0), 0);
  const best = [...qualified].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))[0] ?? null;
  const latest = [...qualified].sort((a, b) => (Date.parse(b.uploadedAt ?? "") || 0) - (Date.parse(a.uploadedAt ?? "") || 0))[0] ?? null;

  return {
    qualifiedWorkCount: qualified.length,
    averagePlayCount: qualified.length ? Math.round(totalPlayCount / qualified.length) : null,
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
      const qualifiedCount = items.filter((item) => item.playCount >= 1000).length;
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

export function buildWorthRedoingTopics(
  rows: Array<Record<string, unknown> & { id?: string; title?: string; summary: TopicWorkSummary }>,
) {
  return rows
    .filter((row) => row.summary.qualifiedWorkCount >= 1)
    .sort((a, b) => (b.summary.averagePlayCount ?? 0) - (a.summary.averagePlayCount ?? 0));
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
    return { ok: false, status: 409, message: "已有作品关联，不能删除该子题" };
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

export async function loadSubTopicDetail(supabase: TopicSupabase, id: string, scope: DataAccessScope): Promise<ApiResult<unknown>> {
  const { data: subTopic, error } = await supabase
    .from("sub_topics")
    .select("*, topics(id, name), topic_groups(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  if (!subTopic) return { ok: false, status: 404, message: "子题不存在" };

  const works = await loadSubTopicWorks(supabase, id, scope, { sort: "best", page: 1, pageSize: 20 });
  return { ok: true, value: { subTopic, works: works.ok ? works.value : null } };
}

export async function loadTopicPool(
  supabase: TopicSupabase,
  userId: string,
  scope: DataAccessScope,
  options: TopicPoolQueryOptions,
): Promise<ApiResult<unknown>> {
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  const since = timeRangeStartIso(options.timeRange);
  let query = supabase
    .from("sub_topics")
    .select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options.view === "my_claims") {
    // “我正在做的”看的是我的认领记录，不按子题创建时间过滤；
    // 先查我的有效认领（candidate/scripting），再在数据库层过滤，保证分页总数正确
    const { data: myClaims, error: myClaimsError } = await supabase
      .from("sub_topic_claims")
      .select("sub_topic_id")
      .eq("user_id", userId)
      .neq("status", "returned");
    if (myClaimsError) return { ok: false, status: 500, message: myClaimsError.message };

    const claimedIds = [
      ...new Set(
        ((myClaims ?? []) as Array<{ sub_topic_id?: string | null }>)
          .map((claim) => claim.sub_topic_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (claimedIds.length === 0) {
      return {
        ok: true,
        value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } },
      };
    }
    query = query.in("id", claimedIds);
  } else {
    // 全部 / 我提交的：按子题创建时间做时间范围过滤
    query = query.gte("created_at", since);
  }

  if (options.topicId) query = query.eq("topic_id", options.topicId);
  if (options.view === "my_created") query = query.eq("created_by", userId);

  const { data, error, count } = await query;
  if (error) return { ok: false, status: 500, message: error.message };

  const items = (data ?? []) as Array<Record<string, unknown>>;

  let summaries: Map<string, TopicWorkSummary>;
  try {
    summaries = await loadTopicSummaries(supabase, items.map((item) => String(item.id)), scope);
  } catch (error) {
    return { ok: false, status: 500, message: error instanceof Error ? error.message : "选题汇总加载失败" };
  }
  return {
    ok: true,
    value: {
      items: items.map((item) => {
        const visibleClaims = Array.isArray(item.sub_topic_claims)
          ? filterTopicClaimsByScope(
              item.sub_topic_claims as Array<{ user_id?: string | null; status?: string }>,
              scope
            )
          : [];
        return {
          ...item,
          sub_topic_claims: visibleClaims,
          summary: summaries.get(String(item.id)) ?? calculateTopicWorkSummary([]),
          claimCount: visibleClaims.filter((claim) => claim.status !== "returned").length,
        };
      }),
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: count ?? items.length,
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

  const scopedRows = applyScope((data ?? []) as Array<Record<string, unknown> & { user_id?: string | null }>, scope);
  for (const subTopicId of subTopicIds) {
    const rows = scopedRows
      .filter((row) => row.topic_id === subTopicId)
      .map((row) => {
        const snapshots = Array.isArray(row.video_metrics_snapshots)
          ? row.video_metrics_snapshots as Array<{ play_count?: number | null }>
          : [];
        const playCount = snapshots.reduce((max, snapshot) => Math.max(max, Number(snapshot.play_count ?? 0)), 0);
        return {
          playCount,
          content: typeof row.content === "string" ? row.content : null,
          uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
        };
      });
    summaryMap.set(subTopicId, calculateTopicWorkSummary(rows));
  }

  return summaryMap;
}

export async function loadActiveTopics(supabase: TopicSupabase, scope: DataAccessScope, limit = 8): Promise<ApiResult<unknown>> {
  let claimsQuery = supabase
    .from("sub_topic_claims")
    .select("*, sub_topics(id, title, hook, created_by, topics(id, name), topic_groups(id, name))")
    .neq("status", "returned")
    .order("claimed_at", { ascending: false });
  if (scope.kind !== "all") claimsQuery = claimsQuery.in("user_id", scope.visibleUserIds);
  const { data: claims, error: claimsError } = await claimsQuery.limit(limit);
  if (claimsError) return { ok: false, status: 500, message: claimsError.message };

  let worksQuery = supabase
    .from("videos")
    .select("id, topic_id, user_id, video_title, content, uploaded_at, sub_topics(id, title, hook, topics(id, name), topic_groups(id, name))")
    .eq("lifecycle_state", "active")
    .not("topic_id", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(limit * 3);
  if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
  const { data: works, error: worksError } = await worksQuery;
  if (worksError) return { ok: false, status: 500, message: worksError.message };

  const { data: created, error: createdError } = await supabase
    .from("sub_topics")
    .select("*, topics(id, name), topic_groups(id, name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (createdError) return { ok: false, status: 500, message: createdError.message };

  let worthRedoingQuery = supabase
    .from("videos")
    .select("topic_id, user_id, sub_topics(id, title, hook, topics(id, name), topic_groups(id, name))")
    .eq("lifecycle_state", "active")
    .not("topic_id", "is", null);
  if (scope.kind !== "all") worthRedoingQuery = worthRedoingQuery.in("user_id", scope.visibleUserIds);
  const { data: worthRedoingWorks, error: worthRedoingError } = await worthRedoingQuery;
  if (worthRedoingError) return { ok: false, status: 500, message: "加载值得再做选题失败" };

  const subTopicsById = new Map<string, Record<string, unknown>>();
  for (const work of (worthRedoingWorks ?? []) as Array<Record<string, unknown>>) {
    const subTopic = Array.isArray(work.sub_topics) ? work.sub_topics[0] : work.sub_topics;
    if (!subTopic || typeof (subTopic as { id?: unknown }).id !== "string") continue;
    subTopicsById.set((subTopic as { id: string }).id, subTopic as Record<string, unknown>);
  }

  let worthRedoing: Array<Record<string, unknown>> = [];
  try {
    const summaries = await loadTopicSummaries(supabase, [...subTopicsById.keys()], scope);
    worthRedoing = buildWorthRedoingTopics(
      [...subTopicsById.values()].map((subTopic) => ({
        ...subTopic,
        summary: summaries.get(String(subTopic.id)) ?? calculateTopicWorkSummary([]),
      })),
    ).slice(0, limit);
  } catch {
    return { ok: false, status: 500, message: "加载值得再做选题失败" };
  }

  return {
    ok: true,
    value: {
      recentlyClaimed: claims ?? [],
      recentlyWorked: (works ?? []).slice(0, limit),
      recentlyCreated: created ?? [],
      worthRedoing,
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

  const { data: videos, error: videosError } = await videosQuery;
  if (videosError) return { ok: false, status: 500, message: "加载对比作品失败" };
  const videoRows = (videos ?? []) as Array<Record<string, unknown>>;
  const videoIds = videoRows.map((row) => String(row.id)).filter(Boolean);
  if (!videoIds.length) {
    return { ok: true, value: { dimension: options.dimension, windowDays: options.days, rows: [], sampleTotal: 0 } };
  }

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("video_metrics_snapshots")
    .select("video_id, play_count, captured_at")
    .in("video_id", videoIds)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false });
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
