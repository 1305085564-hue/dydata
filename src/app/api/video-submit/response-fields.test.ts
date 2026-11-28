import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { abnormalSubmission, submissionDatabase } from "@/lib/testing/maintenance.test.fixture";
import { createQualityCheckController } from "@/app/(app)/dashboard/video-submit-form-v2/quality-check-controller";
import { buildVideoSubmitResponse } from "./route-core";
import { buildSubmittedDailyReportFields, DAILY_REPORT_WRITE_SELECT, SNAPSHOT_WRITE_SELECT, VIDEO_SUBMIT_RESPONSE_SELECT } from "./response-fields";

// 通知是外部边界；测试显式禁用 webhook，避免受开发者环境变量影响。
const originalWebhook = process.env.FEISHU_WEBHOOK_URL;
before(() => { delete process.env.FEISHU_WEBHOOK_URL; });
after(() => {
  if (originalWebhook === undefined) delete process.env.FEISHU_WEBHOOK_URL;
  else process.env.FEISHU_WEBHOOK_URL = originalWebhook;
});

test("视频提交写入只返回后续流程需要的固定字段", () => {
  assert.equal(VIDEO_SUBMIT_RESPONSE_SELECT.includes("*"), false);
  assert.equal(VIDEO_SUBMIT_RESPONSE_SELECT.split(",").map((field) => field.trim()).includes("id"), true);
  assert.equal(VIDEO_SUBMIT_RESPONSE_SELECT.split(",").map((field) => field.trim()).includes("user_id"), true);
  assert.equal(SNAPSHOT_WRITE_SELECT, "id");
  assert.equal(DAILY_REPORT_WRITE_SELECT, "id, report_date");
  assert.deepEqual(buildSubmittedDailyReportFields({ id: "report-1", report_date: "2026-10-25" }), { daily_report_id: "report-1", daily_report_date: "2026-10-25" });
});

test("提交成功返回实际保存的日报编号和归属日，质检用该编号发送请求", async () => {
  const db = submissionDatabase();
  const response = await buildVideoSubmitResponse(new NextRequest("http://localhost/api/video-submit", {
    method: "POST", body: JSON.stringify(abnormalSubmission()),
  }), { createClient: async () => db as never, createAdminClient: () => db as never });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const body = await response.json();
  assert.equal(body.daily_report_id, db.tables.daily_reports[0].id);
  assert.equal(body.daily_report_date, "2026-11-28");
  assert.notEqual(body.daily_report_id, body.video_id);
  assert.equal("ai_tags" in body, false);
  assert.equal("ai_tags" in body.video, false);
  let sent: unknown;
  const errors: string[] = [];
  const controller = createQualityCheckController({
    submittedReportId: body.daily_report_id,
    setHasUserInteracted() {}, setQualityCheck() {}, setIsSubmitted() {}, updateSlotsState() {}, onManualReview() {},
    onError: (message) => errors.push(message),
    fetchImpl: async (url, init) => {
      assert.equal(url, "/api/dashboard/sample-quality-check");
      sent = JSON.parse(String(init?.body));
      return Response.json({ overallStatus: "pass", issues: [] });
    },
  });
  await controller.handleQualityCheck();
  assert.deepEqual(sent, { reportId: db.tables.daily_reports[0].id });
  assert.deepEqual(errors, []);
});

test("日报提交只保存手动标签，不发出 AI 标签生成请求", async () => {
  const db = submissionDatabase();
  const outbound: string[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { outbound.push(String(url)); throw new Error("本次提交不能调用外部 AI"); };
  try {
    const response = await buildVideoSubmitResponse(new NextRequest("http://localhost/api/video-submit", {
      method: "POST", body: JSON.stringify(abnormalSubmission({ topic_tag: "复盘", content_keywords: ["现金流"] })),
    }), { createClient: async () => db as never, createAdminClient: () => db as never });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.deepEqual(db.tables.video_tags.map((tag) => ({ source: tag.source, dimension: tag.tag_dimension, value: tag.tag_value })), [
      { source: "manual", dimension: "话题", value: "复盘" },
      { source: "manual", dimension: "关键词", value: "现金流" },
    ]);
    assert.deepEqual(outbound, []);
  } finally { globalThis.fetch = oldFetch; }
});
