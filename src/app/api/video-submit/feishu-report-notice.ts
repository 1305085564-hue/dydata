import { SHANGHAI_TIME_ZONE } from "@/lib/business-time";
import { interactionRate } from "@/lib/video-metrics";
import { sendFeishuWebhook, type FeishuWebhookResult } from "@/lib/飞书webhook";
import type { VideoSubmitValidationMetrics } from "./validation";

export type FeishuSubmissionNotice = {
  submitter: string | null | undefined;
  reportDate?: string | null | undefined;
  videoTitle: string | null | undefined;
  videoUrl?: string | null | undefined;
  publishedAt: string | null | undefined;
  submittedAt: string;
  metrics: Pick<VideoSubmitValidationMetrics,
    | "play_count"
    | "likes"
    | "comments"
    | "shares"
    | "favorites"
    | "follower_gain"
    | "follower_loss"
    | "avg_play_duration"
    | "bounce_rate_2s"
    | "completion_rate_5s"
    | "completion_rate"
  >;
};

export type FeishuSubmissionNoticeDeps = {
  send?: typeof sendFeishuWebhook;
  logError?: (...args: unknown[]) => void;
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

function metricColumn(label: string, value: string, highlight = false) {
  const formattedValue = highlight && value !== "-"
    ? `<font color='green'>**${value}**</font>`
    : `**${value}**`;
  return {
    tag: "column" as const,
    width: "weighted" as const,
    weight: 1,
    vertical_align: "top" as const,
    elements: [
      {
        tag: "div" as const,
        text: {
          tag: "lark_md" as const,
          content: `<font color='grey'>${label}</font>\n${formattedValue}`,
        },
      },
    ],
  };
}

function metricColumnSet(
  columns: ReturnType<typeof metricColumn>[],
  backgroundStyle: "grey" | "default" = "default",
) {
  return {
    tag: "column_set" as const,
    flex_mode: "stretch" as const,
    background_style: backgroundStyle,
    horizontal_spacing: "small" as const,
    columns,
  };
}

export function buildFeishuSubmissionCard(input: FeishuSubmissionNotice) {
  const metrics = input.metrics;
  const netFollowerGain = computeNetFollowerGain(metrics);
  const rawInteractionRate = interactionRate(metrics);
  const interactionRateText = formatSubmissionMetric(
    rawInteractionRate === null ? null : rawInteractionRate * 100,
    "%",
  );

  return {
    msg_type: "interactive" as const,
    card: {
      config: { wide_screen_mode: true },
      elements: [
        metricColumnSet(
          [
            metricColumn("姓名", displayText(input.submitter)),
            metricColumn("日期", formatSubmissionReportDate(input.reportDate, input.publishedAt)),
            metricColumn("播放量", formatSubmissionMetric(metrics.play_count)),
            metricColumn("关注量", formatSubmissionMetric(netFollowerGain)),
          ],
          "grey",
        ),
        {
          tag: "div" as const,
          text: {
            tag: "lark_md" as const,
            content: buildTitleMarkdown(input.videoTitle, input.videoUrl),
          },
        },
        metricColumnSet([
          metricColumn("点赞", formatSubmissionMetric(metrics.likes)),
          metricColumn("评论", formatSubmissionMetric(metrics.comments)),
          metricColumn("分享", formatSubmissionMetric(metrics.shares)),
          metricColumn("收藏", formatSubmissionMetric(metrics.favorites)),
          metricColumn("互动率", interactionRateText, true),
        ]),
        metricColumnSet([
          metricColumn("5秒完播", formatSubmissionMetric(metrics.completion_rate_5s, "%")),
          metricColumn("整体完播", formatSubmissionMetric(metrics.completion_rate, "%")),
          metricColumn("均播时长", formatSubmissionMetric(metrics.avg_play_duration, "s")),
          metricColumn("2秒跳出", formatSubmissionMetric(metrics.bounce_rate_2s, "%")),
        ]),
        {
          tag: "note" as const,
          elements: [
            {
              tag: "plain_text" as const,
              content: `发布 ${formatSubmissionShanghaiTime(input.publishedAt)}  ·  提交 ${formatSubmissionShanghaiTime(input.submittedAt)}`,
            },
          ],
        },
      ],
    },
  };
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
    const result = await (deps.send ?? sendFeishuWebhook)(buildFeishuSubmissionCard(input));
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
