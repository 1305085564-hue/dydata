import assert from "node:assert/strict";
import test from "node:test";

import { reportCronFailure } from "./cron-failure";

test("没有报警 webhook 时只报 Sentry", async () => {
  const original = process.env.FEISHU_ALERT_WEBHOOK_URL;
  delete process.env.FEISHU_ALERT_WEBHOOK_URL;
  const sentry: Array<{ message: string; level?: string }> = [];
  let fetchCalls = 0;
  try {
    await reportCronFailure("通知清理", new Error("RPC 失败"), {
      now: new Date("2026-11-18T12:34:56.000Z"),
      captureMessage: (message, context) => {
        sentry.push({ message, level: typeof context === "object" && context && "level" in context ? String(context.level) : undefined });
        return "event-1";
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return Response.json({ code: 0 });
      },
    });
  } finally {
    if (original === undefined) delete process.env.FEISHU_ALERT_WEBHOOK_URL;
    else process.env.FEISHU_ALERT_WEBHOOK_URL = original;
  }
  assert.equal(sentry.length, 1);
  assert.equal(sentry[0].level, "error");
  assert.match(sentry[0].message, /^DYData 夜间任务〈通知清理〉失败：RPC 失败，时间/);
  assert.equal(fetchCalls, 0);
});

test("配置报警 webhook 时同时模拟 Sentry 与飞书 fetch", async () => {
  const original = process.env.FEISHU_ALERT_WEBHOOK_URL;
  process.env.FEISHU_ALERT_WEBHOOK_URL = "https://open.feishu.cn/hook/test";
  const sentry: string[] = [];
  const requests: Request[] = [];
  try {
    await reportCronFailure("保活检查", "单账号失败", {
      now: new Date("2026-11-18T12:34:56.000Z"),
      captureMessage: (message) => {
        sentry.push(message);
        return "event-2";
      },
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ code: 0 });
      },
    });
  } finally {
    if (original === undefined) delete process.env.FEISHU_ALERT_WEBHOOK_URL;
    else process.env.FEISHU_ALERT_WEBHOOK_URL = original;
  }
  assert.equal(sentry.length, 1);
  assert.equal(requests.length, 1);
  const body = await requests[0].json() as { content?: { text?: string } };
  assert.match(body.content?.text ?? "", /^DYData 夜间任务〈保活检查〉失败：单账号失败，时间/);
});

