import assert from "node:assert/strict";
import test, { before, after } from "node:test";

import { NextRequest } from "next/server";
import { abnormalSubmission, submissionDatabase } from "@/lib/testing/maintenance.test.fixture";
import { buildVideoSubmitResponse } from "./route-core";

import { resolveDailyReportSubmissionTarget } from "./report-target";

// 通知是外部边界；测试显式禁用 webhook，避免受开发者环境变量影响。
const originalWebhook = process.env.FEISHU_WEBHOOK_URL;
before(() => { delete process.env.FEISHU_WEBHOOK_URL; });
after(() => {
  if (originalWebhook === undefined) delete process.env.FEISHU_WEBHOOK_URL;
  else process.env.FEISHU_WEBHOOK_URL = originalWebhook;
});

test("新建或异常提交始终新建本次作品的日报，不复用同账号同业务日旧日报", () => {
  assert.deepEqual(
    resolveDailyReportSubmissionTarget({
      mode: "create",
      editBinding: null,
    }),
    { action: "insert", existingReport: null },
  );

  assert.deepEqual(
    resolveDailyReportSubmissionTarget({
      mode: "abnormal",
      editBinding: null,
    }),
    { action: "insert", existingReport: null },
  );
});

test("编辑提交只更新经过 video_id 校验的原日报", () => {
  const report = { id: "report-1", video_id: "video-1" };
  assert.deepEqual(
    resolveDailyReportSubmissionTarget({
      mode: "edit",
      editBinding: { ok: true, dailyReport: report },
    }),
    { action: "update", existingReport: report },
  );
});

test("新作品提交为同账号同日另建日报，旧日报内容不被覆盖", async () => {
  const db = submissionDatabase();
  const previous = { id: "old-report", user_id: "member-1", account_id: "account-1", report_date: "2026-11-28", video_id: "old-video", content: "旧日报不能变", is_void: false };
  db.tables.daily_reports.push(previous);
  const response = await buildVideoSubmitResponse(new NextRequest("http://localhost/api/video-submit", {
    method: "POST", body: JSON.stringify(abnormalSubmission()),
  }), { createClient: async () => db as never, createAdminClient: () => db as never });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const body = await response.json();
  assert.notEqual(body.daily_report_id, "old-report");
  assert.equal(db.tables.daily_reports.length, 2);
  assert.deepEqual(db.tables.daily_reports.find((row) => row.id === "old-report"), previous);
  assert.equal(db.calls.some((call) => call.table === "daily_reports" && call.operation === "insert"), true);
});
