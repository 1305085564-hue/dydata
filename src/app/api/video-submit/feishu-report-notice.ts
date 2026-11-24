import { SHANGHAI_TIME_ZONE } from "@/lib/business-time";
import { sendFeishuWebhook, type FeishuWebhookResult } from "@/lib/飞书webhook";
import type { VideoSubmitValidationMetrics } from "./validation";

export type FeishuSubmissionNotice = {
  submitter: string | null | undefined;
  accountName: string | null | undefined;
  videoTitle: string | null | undefined;
  publishedAt: string | null | undefined;
  submittedAt: string;
  metrics: Pick<VideoSubmitValidationMetrics,
    "play_count" | "likes" | "comments" | "shares" | "favorites" | "completion_rate_5s" | "completion_rate"
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

export function formatSubmissionShanghaiTime(value: string | null | undefined) {
  if (!value) return "未填写/未识别";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未填写/未识别";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "-";
  return `${part("year")}年${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`;
}

function markdownField(label: string, value: string) {
  return { is_short: true, text: { tag: "lark_md", content: `**${label}**\n${value}` } };
}

export function buildFeishuSubmissionCard(input: FeishuSubmissionNotice) {
  const metrics = input.metrics;
  return {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: "📢 作品数据提交通知" },
        template: "blue",
      },
      elements: [
        {
          tag: "div",
          fields: [
            markdownField("责任人 / 提交人", displayText(input.submitter)),
            markdownField("作品账号", displayText(input.accountName)),
          ],
        },
        { tag: "div", text: { tag: "lark_md", content: `**作品标题**\n${displayText(input.videoTitle)}` } },
        { tag: "hr" },
        {
          tag: "div",
          text: { tag: "lark_md", content: `**播放量**\n# ${formatSubmissionMetric(metrics.play_count)}` },
        },
        {
          tag: "div",
          fields: [
            markdownField("点赞", formatSubmissionMetric(metrics.likes)),
            markdownField("评论", formatSubmissionMetric(metrics.comments)),
            markdownField("分享", formatSubmissionMetric(metrics.shares)),
            markdownField("收藏", formatSubmissionMetric(metrics.favorites)),
          ],
        },
        {
          tag: "div",
          fields: [
            markdownField("5秒完播率", formatSubmissionMetric(metrics.completion_rate_5s, "%")),
            markdownField("整体完播率", formatSubmissionMetric(metrics.completion_rate, "%")),
            markdownField("发布时间", formatSubmissionShanghaiTime(input.publishedAt)),
            markdownField("提交时间（上海）", formatSubmissionShanghaiTime(input.submittedAt)),
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
