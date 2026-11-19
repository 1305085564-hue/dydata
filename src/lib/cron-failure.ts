import * as Sentry from "@sentry/nextjs";

import { sendFeishuWebhook, type FeishuWebhookDeps } from "./飞书webhook";

const SHANGHAI_TZ = "Asia/Shanghai";

type CronFailureDependencies = {
  captureMessage?: typeof Sentry.captureMessage;
  fetchImpl?: FeishuWebhookDeps["fetchImpl"];
  now?: Date;
};

function formatShanghaiTime(now: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now).replace(/\//g, "-");
}

function normalizeDetail(detail: unknown): string {
  const value = detail instanceof Error ? detail.message : String(detail ?? "未知错误");
  return value.replace(/[\r\n]+/g, " ").slice(0, 200);
}

export async function reportCronFailure(
  job: string,
  detail: unknown,
  dependencies: CronFailureDependencies = {},
): Promise<void> {
  const reason = normalizeDetail(detail);
  const timestamp = formatShanghaiTime(dependencies.now ?? new Date());
  const message = `DYData 夜间任务〈${job}〉失败：${reason}，时间${timestamp}`;
  const captureMessage = dependencies.captureMessage ?? Sentry.captureMessage;
  captureMessage(message, { level: "error", tags: { cron_job: job } });

  const webhookUrl = process.env.FEISHU_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  await sendFeishuWebhook(
    { msg_type: "text", content: { text: message } },
    { webhookUrl, fetchImpl: dependencies.fetchImpl },
  );
}

