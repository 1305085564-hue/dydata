/**
 * Cloudflare Clairic 识别通道：v2 字段清单、+08:00 发布时间解析、单项低置信度强制转人工，
 * 以及通道异常自动回退百度通道（业务全空不回退）。
 */

import {
  CLAIRIC_MODEL_ID,
  callClairicOcr,
  type ClairicAnswer,
  type ClairicFieldSpec,
  type ClairicUsage,
} from "@/lib/clairic-ocr";
import { runBaiduOcrAttempt, type BaiduOcrAttemptResult } from "./baidu-channel";
import {
  buildNoTextFailedResponse,
  type ConfidenceLevel,
  type ParsedOcrResult,
  type ParsedScreenshotResponse,
  type PublishedAtRecognition,
  type RetentionMetrics,
  type ScreenshotType,
} from "./ocr-contract";
import {
  buildDataScreenshotResponse,
  buildRetentionScreenshotResponse,
} from "./ocr-response-builders";

export const CLAIRIC_CONFIDENCE_HIGH = 0.90;
export const CLAIRIC_CONFIDENCE_MEDIUM = 0.80;
export const CLAIRIC_MAX_P_NULL_FOR_PRESENT = 0.20;
export const CLAIRIC_MIN_P_NULL_FOR_ABSENT = 0.80;

const PUBLISHED_AT_INSTRUCTIONS =
  "作品发布时间：页面顶部作品卡片里的日期时间（例如 2026年11月19日 18:41 或 2026-11-19 18:57 发布，两种写法都算），或页面明确写有『发布』二字的那行，原样返回。趋势图横轴、观看趋势、粉丝趋势、悬浮提示框里的时间刻度都不是发布时间，绝对不要取。页面没有发布时间就返回 null";
const VIDEO_TITLE_INSTRUCTIONS = "作品主标题，去掉 #话题；本页没有就返回 null";

export const CLAIRIC_FIELDS_V2: Record<ScreenshotType, Record<string, ClairicFieldSpec>> = {
  data: {
    play_count: { type: "number", integer: true, instructions: "播放量；若印的是 9.28万 这类带『万』的数，换算成 92800 这样的整数" },
    likes: { type: "number", integer: true, instructions: "总览页第二格『点赞量』的数值。不要取评论量、收藏量、分享量、弹幕量，也不要取趋势图纵轴刻度" },
    comments: { type: "number", integer: true, instructions: "评论量，不是弹幕量" },
    shares: { type: "number", integer: true, instructions: "分享量" },
    favorites: { type: "number", integer: true, instructions: "总览页第二行中间『收藏量』的数值。不要取点赞量、评论量、分享量、涨粉量" },
    follower_gain: { type: "number", integer: true, instructions: "页面下方『粉丝』区块第一格『涨粉量』。不要取脱粉量、粉丝播放占比、评论量" },
    video_title: { type: "text", instructions: VIDEO_TITLE_INSTRUCTIONS },
    published_at_text: { type: "text", instructions: PUBLISHED_AT_INSTRUCTIONS },
  },
  retention: {
    video_title: { type: "text", instructions: VIDEO_TITLE_INSTRUCTIONS },
    avg_play_duration: { type: "number", decimals: 1, instructions: "平均播放时长，只要秒数纯数字，不带『秒』" },
    avg_play_ratio: { type: "number", decimals: 2, instructions: "平均播放占比，去掉 % 的数字；不是封面点击率、不是粉丝播放占比" },
    bounce_rate_2s: { type: "number", decimals: 2, instructions: "留存页『2s跳出率』这一格。不要取完播率、5s完播率" },
    completion_rate_5s: { type: "number", decimals: 2, instructions: "留存页『5s完播率』这一格。不要取完播率、2s跳出率" },
    completion_rate: { type: "number", decimals: 2, instructions: "留存页『完播率』这一格，不带 5s/2s 前缀。不要取 5s完播率、2s跳出率、封面点击率、平均播放占比" },
    published_at_text: { type: "text", instructions: PUBLISHED_AT_INSTRUCTIONS },
  },
};

export type ClairicTimingsLike = {
  clairic_ms?: number;
  baidu_ms?: number;
  structure_ms?: number;
};

export type ClairicOcrAttemptInput = {
  dataUrl: string;
  screenshotType: ScreenshotType;
  timings: Partial<ClairicTimingsLike> & Record<string, unknown>;
};

export type ClairicOcrAttemptResult = {
  parsed: ParsedScreenshotResponse;
  channelName: "clairic";
  model: typeof CLAIRIC_MODEL_ID;
  usage: ClairicUsage | null;
};

export type ClairicOrFallbackResult = {
  parsed: ParsedScreenshotResponse | null;
  channelName: string;
  model: string | null;
  clairicUsage: ClairicUsage | null;
  fallback: { from: "clairic"; to: "baidu"; reason: string } | null;
};

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (match) {
    return { contentType: match[1].trim().toLowerCase(), buffer: Buffer.from(match[2], "base64") };
  }
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return { contentType: "image/png", buffer: Buffer.from(base64, "base64") };
}

/**
 * 解析 Clairic 原样返回的中文/横杠/斜杠发布时间字符串为 UTC ISO。
 * 精准保留小时与分钟，按 +08:00（Asia/Shanghai）拼接并校验日历合法性，同时保留原文本。
 */
export function parseClairicPublishedAt(rawText: unknown): {
  published_at: string | null;
  published_at_text: string | null;
} {
  if (typeof rawText !== "string") return { published_at: null, published_at_text: null };
  const trimmed = rawText.trim();
  if (!trimmed) return { published_at: null, published_at_text: null };

  const dateMatch = trimmed.match(/(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/);
  if (!dateMatch || dateMatch.index === undefined) {
    return { published_at: null, published_at_text: trimmed };
  }

  const afterDate = trimmed.slice(dateMatch.index + dateMatch[0].length);
  const timeMatch = afterDate.match(/(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[:：]\s*(\d{2}))?/);
  if (!timeMatch) return { published_at: null, published_at_text: trimmed };

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = timeMatch[3] !== undefined ? Number(timeMatch[3]) : 0;

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return { published_at: null, published_at_text: trimmed };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoLocal = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+08:00`;
  const parsed = new Date(isoLocal);
  if (Number.isNaN(parsed.getTime())) return { published_at: null, published_at_text: trimmed };

  const shanghai = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
  if (shanghai.getUTCFullYear() !== year || shanghai.getUTCMonth() + 1 !== month || shanghai.getUTCDate() !== day) {
    return { published_at: null, published_at_text: trimmed };
  }

  return { published_at: parsed.toISOString(), published_at_text: trimmed };
}

function extractAnswerValue(answer: ClairicAnswer | undefined): unknown {
  if (!answer) return null;
  return answer.value !== undefined ? answer.value : (answer.guess ?? null);
}

function isBlankValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function normalizeClairicNumber(
  raw: unknown,
  opts: { integer?: boolean; min?: number; max?: number } = {},
): number | null {
  if (isBlankValue(raw)) return null;
  let parsed: number;
  if (typeof raw === "number") {
    parsed = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/[,%\s秒sS]/g, "");
    if (!cleaned) return null;
    const hasWan = /万$/.test(cleaned);
    const numPart = hasWan ? cleaned.slice(0, -1) : cleaned;
    if (!numPart) return null;
    parsed = Number(numPart);
    if (hasWan) parsed *= 10_000;
  } else {
    return null;
  }

  if (!Number.isFinite(parsed)) return null;
  const normalizedValue = opts.integer ? Math.round(parsed) : Math.round(parsed * 100) / 100;
  if (opts.min !== undefined && normalizedValue < opts.min) return null;
  if (opts.max !== undefined && normalizedValue > opts.max) return null;
  return normalizedValue;
}

function normalizeClairicTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type EvaluatedField = { value: number | null; level: ConfidenceLevel; score: number; alert: boolean };

function evaluateNumericField(
  answer: ClairicAnswer | undefined,
  opts: { integer?: boolean; min?: number; max?: number } = {},
): EvaluatedField {
  const raw = extractAnswerValue(answer);
  const rawWasNonBlank = !isBlankValue(raw);
  const value = normalizeClairicNumber(raw, opts);
  const conf = readNumberOrNull(answer?.confidence);
  const pNull = readNumberOrNull(answer?.p_null);

  if (value !== null) {
    const ok = conf !== null && conf >= CLAIRIC_CONFIDENCE_MEDIUM && (pNull === null || pNull <= CLAIRIC_MAX_P_NULL_FOR_PRESENT);
    if (ok) {
      return { value, level: conf >= CLAIRIC_CONFIDENCE_HIGH ? "high" : "medium", score: conf, alert: false };
    }
    return { value, level: "low", score: conf ?? 0, alert: true };
  }

  if (rawWasNonBlank) return { value: null, level: "low", score: 0, alert: true };
  if (pNull !== null && pNull >= CLAIRIC_MIN_P_NULL_FOR_ABSENT) {
    return { value: null, level: pNull >= CLAIRIC_CONFIDENCE_HIGH ? "high" : "medium", score: pNull, alert: false };
  }
  return { value: null, level: "low", score: conf ?? 0, alert: true };
}

function evaluatePublishedAtField(answer: ClairicAnswer | undefined): {
  publishedAt: PublishedAtRecognition;
  alert: boolean;
} {
  const raw = extractAnswerValue(answer);
  if (typeof raw !== "string" || !raw.trim()) {
    return { publishedAt: { published_at: null, published_at_text: null, published_at_confidence: "low" }, alert: false };
  }

  const { published_at, published_at_text } = parseClairicPublishedAt(raw);
  const conf = readNumberOrNull(answer?.confidence);
  const pNull = readNumberOrNull(answer?.p_null);
  const confOk = conf !== null && conf >= CLAIRIC_CONFIDENCE_MEDIUM && (pNull === null || pNull <= CLAIRIC_MAX_P_NULL_FOR_PRESENT);

  if (published_at && confOk) {
    return {
      publishedAt: { published_at, published_at_text, published_at_confidence: conf >= CLAIRIC_CONFIDENCE_HIGH ? "high" : "medium" },
      alert: false,
    };
  }
  return { publishedAt: { published_at, published_at_text, published_at_confidence: "low" }, alert: true };
}

function computeConfidenceScore(levels: ConfidenceLevel[]): number {
  const scoreMap: Record<ConfidenceLevel, number> = { high: 1, medium: 0.5, low: 0 };
  const total = levels.reduce((sum, level) => sum + scoreMap[level], 0);
  return Math.round((total / levels.length) * 100) / 100;
}

export function convertClairicAnswersToResponse(
  answers: Record<string, ClairicAnswer>,
  screenshotType: ScreenshotType,
): ParsedScreenshotResponse {
  const videoTitle = normalizeClairicTitle(extractAnswerValue(answers.video_title));
  const { publishedAt, alert: pubAlert } = evaluatePublishedAtField(answers.published_at_text);

  if (screenshotType === "retention") {
    const avgPlayDuration = evaluateNumericField(answers.avg_play_duration, { min: 0 });
    const avgPlayRatio = evaluateNumericField(answers.avg_play_ratio, { min: 0, max: 100 });
    const bounceRate2s = evaluateNumericField(answers.bounce_rate_2s, { min: 0, max: 100 });
    const completionRate5s = evaluateNumericField(answers.completion_rate_5s, { min: 0, max: 100 });
    const completionRate = evaluateNumericField(answers.completion_rate, { min: 0, max: 100 });

    const evaluated = [avgPlayDuration, avgPlayRatio, bounceRate2s, completionRate5s, completionRate];
    if (evaluated.every((item) => item.value === null)) return buildNoTextFailedResponse("retention");

    const retentionMetrics: RetentionMetrics = {
      avg_play_duration: avgPlayDuration.value,
      avg_play_ratio: avgPlayRatio.value,
      bounce_rate_2s: bounceRate2s.value,
      completion_rate_5s: completionRate5s.value,
      completion_rate: completionRate.value,
    };
    const avgScore = Math.round((evaluated.reduce((sum, item) => sum + item.score, 0) / evaluated.length) * 100) / 100;
    const response = buildRetentionScreenshotResponse(
      {
        recognized: true,
        retention_metrics: retentionMetrics,
        confidence: avgScore,
        ...(videoTitle ? { video_title: videoTitle } : {}),
        ...(publishedAt.published_at || publishedAt.published_at_text ? { publishedAt } : {}),
      },
      "retention",
    );
    return evaluated.some((item) => item.alert) || pubAlert
      ? { ...response, slot_status: "pending_confirm", requires_manual_confirmation: true }
      : response;
  }

  const playCount = evaluateNumericField(answers.play_count, { integer: true, min: 0 });
  const likes = evaluateNumericField(answers.likes, { integer: true, min: 0 });
  const comments = evaluateNumericField(answers.comments, { integer: true, min: 0 });
  const shares = evaluateNumericField(answers.shares, { integer: true, min: 0 });
  const favorites = evaluateNumericField(answers.favorites, { integer: true, min: 0 });
  const followerGain = evaluateNumericField(answers.follower_gain, { integer: true });

  const evaluated = [playCount, likes, comments, shares, favorites, followerGain];
  if (evaluated.every((item) => item.value === null) && !videoTitle) return buildNoTextFailedResponse("data");

  const parsedData: ParsedOcrResult = {
    play_count: playCount.value,
    likes: likes.value,
    comments: comments.value,
    shares: shares.value,
    favorites: favorites.value,
    follower_gain: followerGain.value,
    video_title: videoTitle,
    confidence: {
      play_count: playCount.level,
      likes: likes.level,
      comments: comments.level,
      shares: shares.level,
      favorites: favorites.level,
      follower_gain: followerGain.level,
    },
    publishedAt,
  };

  const confidenceScore = computeConfidenceScore(Object.values(parsedData.confidence));
  const response = buildDataScreenshotResponse(parsedData, "data", confidenceScore);
  return evaluated.some((item) => item.alert) || pubAlert
    ? { ...response, slot_status: "pending_confirm", requires_manual_confirmation: true }
    : response;
}

export async function runClairicOcrAttempt(
  input: ClairicOcrAttemptInput,
  deps: { callClairic?: typeof callClairicOcr } = {},
): Promise<ClairicOcrAttemptResult> {
  const callClairic = deps.callClairic ?? callClairicOcr;
  const { buffer, contentType } = decodeDataUrl(input.dataUrl);
  const startedAt = Date.now();
  try {
    const result = await callClairic({ buffer, contentType, fields: CLAIRIC_FIELDS_V2[input.screenshotType] });
    const parsed = convertClairicAnswersToResponse(result.answers, input.screenshotType);
    return { parsed, channelName: "clairic", model: CLAIRIC_MODEL_ID, usage: result.usage };
  } finally {
    input.timings.clairic_ms = (input.timings.clairic_ms ?? 0) + Date.now() - startedAt;
  }
}

function formatFallbackChannelName(baiduChannelName: string): string {
  const inner = baiduChannelName.match(/^baidu \((.+)\)$/);
  if (inner) return `clairic->baidu (${inner[1]})`;
  if (baiduChannelName === "baidu") return "clairic->baidu";
  return `clairic->baidu (${baiduChannelName})`;
}

/**
 * 执行 Clairic 识别；仅当 Clairic 抛出通道异常（缺配置、超时、鉴权、429/5xx、非法响应等）时
 * 自动无缝回退百度通道。业务识别无结果（slot_status: "failed"）直接返回，不回退。
 */
export async function runClairicAttemptWithBaiduFallback(
  input: ClairicOcrAttemptInput,
  deps: {
    runClairicAttempt?: typeof runClairicOcrAttempt;
    runBaiduAttempt?: (arg: {
      dataUrl: string;
      screenshotType: ScreenshotType;
      timings: Partial<ClairicTimingsLike> & Record<string, unknown>;
    }) => Promise<BaiduOcrAttemptResult>;
  } = {},
): Promise<ClairicOrFallbackResult> {
  const runClairic = deps.runClairicAttempt ?? runClairicOcrAttempt;
  const runBaidu = deps.runBaiduAttempt ?? runBaiduOcrAttempt;

  try {
    const attempt = await runClairic(input);
    return {
      parsed: attempt.parsed,
      channelName: attempt.channelName,
      model: attempt.model,
      clairicUsage: attempt.usage,
      fallback: null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const baiduAttempt = await runBaidu({
      dataUrl: input.dataUrl,
      screenshotType: input.screenshotType,
      timings: input.timings,
    });
    return {
      parsed: baiduAttempt.parsed,
      channelName: formatFallbackChannelName(baiduAttempt.channelName),
      model: baiduAttempt.model,
      clairicUsage: null,
      fallback: { from: "clairic", to: "baidu", reason },
    };
  }
}
