import { SHANGHAI_TIME_ZONE } from "@/lib/business-time";
import type { BreakoutGrade } from "@/lib/breakout-rating";
import { buildWorkContentQualityFromMetrics } from "@/lib/content-quality";
import {
  contentAchievementTone,
  DEFAULT_EVALUATION_STANDARDS,
  evaluationTone,
  interactionRateTone,
  type EvaluationStandards,
  type EvaluationTone,
} from "@/lib/evaluation-standards";
import { loadEvaluationSettings } from "@/lib/evaluation-standards-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { interactionRate } from "@/lib/video-metrics";
import { sendFeishuWebhook, type FeishuWebhookResult } from "@/lib/飞书webhook";
import type { VideoSubmitValidationMetrics } from "./validation";

export type FeishuSubmissionNotice = {
  submitter: string | null | undefined;
  teamId?: string | null | undefined;
  reportDate?: string | null | undefined;
  videoTitle: string | null | undefined;
  videoUrl?: string | null | undefined;
  topicTag?: string | null | undefined;
  publishedAt: string | null | undefined;
  submittedAt: string;
  standards?: EvaluationStandards;
  metrics: Pick<VideoSubmitValidationMetrics,
    | "play_count"
    | "likes"
    | "comments"
    | "shares"
    | "favorites"
    | "follower_gain"
    | "follower_loss"
    | "avg_play_duration"
    | "avg_play_ratio"
    | "bounce_rate_2s"
    | "completion_rate_5s"
    | "completion_rate"
  >;
};

export type FeishuSubmissionNoticeDeps = {
  send?: typeof sendFeishuWebhook;
  loadStandards?: (teamId: string) => Promise<EvaluationStandards>;
  logError?: (...args: unknown[]) => void;
};

const GRADE_TAG_COLOR: Record<BreakoutGrade, "purple" | "carmine" | "neutral"> = {
  优: "purple",
  良: "carmine",
  普: "neutral",
};

export function shouldNotifyFirstDailyReport(existingReport: unknown | null | undefined) {
  return existingReport == null;
}

export function scheduleFirstDailyReportNotice(
  existingReport: unknown | null | undefined,
  input: FeishuSubmissionNotice,
  deps: FeishuSubmissionNoticeDeps = {},
): void {
  if (shouldNotifyFirstDailyReport(existingReport)) {
    void dispatchFeishuSubmissionNotice(input, deps);
  }
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}\[\]()#+.!|<>~-]/g, "\\$&");
}

function displayText(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? escapeMarkdown(text) : "-";
}

export function formatSubmissionMetric(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

export function formatNetFollowerGain(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatRetentionAchievement(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}%`;
}

export function computeNetFollowerGain(
  metrics: Pick<FeishuSubmissionNotice["metrics"], "follower_gain" | "follower_loss">,
): number | null {
  if (typeof metrics.follower_gain !== "number" || !Number.isFinite(metrics.follower_gain)) return null;
  const loss = typeof metrics.follower_loss === "number" && Number.isFinite(metrics.follower_loss)
    ? metrics.follower_loss
    : 0;
  return metrics.follower_gain - loss;
}

export function formatSubmissionReportDate(
  reportDate: string | null | undefined,
  publishedAt: string | null | undefined,
): string {
  const dateOnlyMatch = typeof reportDate === "string" ? /^\d{4}-(\d{2})-(\d{2})$/.exec(reportDate.trim()) : null;
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}`;
  if (!publishedAt) return "-";
  const date = new Date(publishedAt);
  if (!Number.isFinite(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;
  return month && day ? `${month}-${day}` : "-";
}

export function formatSubmissionShanghaiTime(value: string | null | undefined) {
  if (!value) return "未识别";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未识别";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "-";
  return `${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return null;
  }
}

function buildTitleMarkdown(videoTitle: string | null | undefined, videoUrl: string | null | undefined): string {
  const escapedTitle = displayText(videoTitle);
  if (escapedTitle === "-") return "**-**";
  const safeUrl = normalizeHttpUrl(videoUrl);
  return safeUrl ? `[**《${escapedTitle}》**](${safeUrl})` : `**《${escapedTitle}》**`;
}

function buildHeaderTitleLine(
  videoTitle: string | null | undefined,
  videoUrl: string | null | undefined,
  grade: BreakoutGrade | null,
  topicTag: string | null | undefined,
): string {
  const parts = [buildTitleMarkdown(videoTitle, videoUrl)];
  if (grade) {
    parts.push(`<text_tag color='${GRADE_TAG_COLOR[grade]}'>${grade}</text_tag>`);
  }
  const trimmedTopic = typeof topicTag === "string" ? topicTag.trim() : "";
  if (trimmedTopic) {
    parts.push(`<text_tag color='neutral'>${escapeMarkdown(trimmedTopic)}</text_tag>`);
  }
  return parts.join(" ");
}

function formatTonedValue(value: string, tone: EvaluationTone): string {
  if (value === "-" || tone === "normal") return `**${value}**`;
  const color = tone === "good" ? "red" : "green";
  return `<font color='${color}'>**${value}**</font>`;
}

function markdownBlock(
  content: string,
  textSize: "heading" | "normal" | "notation" = "normal",
) {
  return {
    tag: "markdown" as const,
    text_size: textSize,
    content,
  };
}

function heroColumn(label: string, value: string) {
  return {
    tag: "column" as const,
    width: "weighted" as const,
    weight: 1,
    vertical_align: "top" as const,
    vertical_spacing: "small" as const,
    elements: [
      markdownBlock(`<font color='grey'>${label}</font>`, "notation"),
      markdownBlock(`**${value}**`, "heading"),
    ],
  };
}

function metricColumn(label: string, value: string, tone: EvaluationTone = "normal") {
  return {
    tag: "column" as const,
    width: "weighted" as const,
    weight: 1,
    vertical_align: "top" as const,
    vertical_spacing: "small" as const,
    elements: [
      markdownBlock(`<font color='grey'>${label}</font>`, "notation"),
      markdownBlock(formatTonedValue(value, tone), "normal"),
    ],
  };
}

function metricColumnSet(
  columns: ReturnType<typeof metricColumn>[],
  options: {
    flexMode: "bisect" | "none";
    backgroundStyle: "grey" | "default";
    horizontalSpacing: "small" | "medium";
  },
) {
  return {
    tag: "column_set" as const,
    flex_mode: options.flexMode,
    background_style: options.backgroundStyle,
    horizontal_spacing: options.horizontalSpacing,
    columns,
  };
}

export function buildFeishuSubmissionCard(input: FeishuSubmissionNotice) {
  const standards = input.standards ?? DEFAULT_EVALUATION_STANDARDS;
  const metrics = input.metrics;
  const netFollowerGain = computeNetFollowerGain(metrics);
  const rawInteractionRate = interactionRate(metrics);
  const interactionRateText = formatSubmissionMetric(
    rawInteractionRate === null ? null : rawInteractionRate * 100,
    "%",
  );
  const quality = buildWorkContentQualityFromMetrics(
    {
      videoId: "feishu-notice",
      snapshot: {
        playCount: metrics.play_count ?? null,
        likes: metrics.likes ?? null,
        comments: metrics.comments ?? null,
        shares: metrics.shares ?? null,
        favorites: metrics.favorites ?? null,
        avgPlayDuration: metrics.avg_play_duration ?? null,
        avgPlayRatio: typeof metrics.avg_play_ratio === "number" && Number.isFinite(metrics.avg_play_ratio)
          ? metrics.avg_play_ratio / 100
          : null,
        bounceRate2s: metrics.bounce_rate_2s ?? null,
        completionRate5s: metrics.completion_rate_5s ?? null,
        completionRate: metrics.completion_rate ?? null,
      },
    },
    {
      state: "ready",
      // gate:transient-map 单条卡片构造期临时单元素 Map，函数返回即释放，非进程缓存
      tags: new Map([["feishu-notice", input.topicTag ?? null]]),
    },
    standards,
  );
  const retentionAchievementText = formatRetentionAchievement(quality.contentAchievement);

  return {
    msg_type: "interactive" as const,
    card: {
      schema: "2.0" as const,
      config: {
        width_mode: "default" as const,
      },
      body: {
        direction: "vertical" as const,
        padding: "14px 16px 14px 16px" as const,
        vertical_spacing: "medium" as const,
        elements: [
          markdownBlock(
            buildHeaderTitleLine(input.videoTitle, input.videoUrl, quality.overallGrade, input.topicTag),
            "heading",
          ),
          markdownBlock(
            `<font color='grey'>${displayText(input.submitter)}  ·  ${formatSubmissionReportDate(input.reportDate, input.publishedAt)}</font>`,
            "notation",
          ),
          metricColumnSet(
            [
              heroColumn("播放量", formatSubmissionMetric(metrics.play_count)),
              heroColumn("净涨粉", formatNetFollowerGain(netFollowerGain)),
            ],
            { flexMode: "bisect", backgroundStyle: "grey", horizontalSpacing: "medium" },
          ),
          markdownBlock("<font color='grey'>互动表现</font>", "notation"),
          metricColumnSet(
            [
              metricColumn("点赞", formatSubmissionMetric(metrics.likes)),
              metricColumn("评论", formatSubmissionMetric(metrics.comments)),
              metricColumn("分享", formatSubmissionMetric(metrics.shares)),
              metricColumn("收藏", formatSubmissionMetric(metrics.favorites)),
              metricColumn("互动率", interactionRateText, interactionRateTone(rawInteractionRate, metrics.play_count, standards)),
            ],
            { flexMode: "none", backgroundStyle: "default", horizontalSpacing: "small" },
          ),
          { tag: "hr" as const },
          markdownBlock("<font color='grey'>留存表现</font>", "notation"),
          metricColumnSet(
            [
              metricColumn("2秒跳出", formatSubmissionMetric(metrics.bounce_rate_2s, "%"), evaluationTone("bounceRate2s", metrics.bounce_rate_2s, metrics.play_count, standards)),
              metricColumn("5秒完播", formatSubmissionMetric(metrics.completion_rate_5s, "%"), evaluationTone("completionRate5s", metrics.completion_rate_5s, metrics.play_count, standards)),
              metricColumn("均播时长", formatSubmissionMetric(metrics.avg_play_duration, "s"), evaluationTone("avgPlayDuration", metrics.avg_play_duration, metrics.play_count, standards)),
              metricColumn("整体完播", formatSubmissionMetric(metrics.completion_rate, "%"), evaluationTone("completionRate", metrics.completion_rate, metrics.play_count, standards)),
              metricColumn("留存达成", retentionAchievementText, contentAchievementTone(quality.contentAchievement, metrics.play_count, standards.minPlayCount)),
            ],
            { flexMode: "none", backgroundStyle: "default", horizontalSpacing: "small" },
          ),
          { tag: "hr" as const },
          markdownBlock(
            `<font color='grey'>发布 ${formatSubmissionShanghaiTime(input.publishedAt)}  ·  提交 ${formatSubmissionShanghaiTime(input.submittedAt)}</font>`,
            "notation",
          ),
        ],
      },
    },
  };
}

async function resolveNoticeStandards(
  input: FeishuSubmissionNotice,
  deps: FeishuSubmissionNoticeDeps,
  safeLogError: (...args: unknown[]) => void,
): Promise<EvaluationStandards> {
  if (input.standards) return input.standards;
  if (!input.teamId) return DEFAULT_EVALUATION_STANDARDS;
  try {
    if (deps.loadStandards) {
      return await deps.loadStandards(input.teamId);
    }
    const { standards } = await loadEvaluationSettings(createAdminClient(), input.teamId);
    return standards;
  } catch {
    safeLogError("[video-submit] 飞书播报读取团队评价标准失败，已回退默认标准");
    return DEFAULT_EVALUATION_STANDARDS;
  }
}

/**
 * 飞书播报是提交成功后的非核心副作用：任何异常都只能记录，不能回到提交请求。
 * 发送器本身不会抛错，这里的 catch 仍保留作最后一道边界保护，避免替换发送器时
 * 意外产生未处理 rejection。
 */
export async function dispatchFeishuSubmissionNotice(
  input: FeishuSubmissionNotice,
  deps: FeishuSubmissionNoticeDeps = {},
): Promise<FeishuWebhookResult> {
  const logError = deps.logError ?? console.error;
  const safeLogError = (...args: unknown[]) => {
    try { logError(...args); } catch { /* logging must not escape the side-effect boundary */ }
  };
  try {
    if (!deps.send && !process.env.FEISHU_WEBHOOK_URL) {
      safeLogError("[video-submit] 作品日报飞书播报失败", {
        reason: "not_configured",
        status: undefined,
      });
      return { ok: false, reason: "not_configured" };
    }
    const standards = await resolveNoticeStandards(input, deps, safeLogError);
    const result = await (deps.send ?? sendFeishuWebhook)(buildFeishuSubmissionCard({ ...input, standards }));
    if (!result.ok) {
      safeLogError("[video-submit] 作品日报飞书播报失败", {
        reason: result.reason,
        status: result.status,
      });
    }
    return result;
  } catch {
    safeLogError("[video-submit] 作品日报飞书播报异常");
    return { ok: false, reason: "network" };
  }
}
