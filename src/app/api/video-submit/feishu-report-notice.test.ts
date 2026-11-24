import assert from "node:assert/strict";
import test from "node:test";
import { buildFeishuSubmissionCard, dispatchFeishuSubmissionNotice, formatSubmissionMetric, formatSubmissionShanghaiTime, scheduleFirstDailyReportNotice, shouldNotifyFirstDailyReport, type FeishuSubmissionNotice } from "./feishu-report-notice";

const notice: FeishuSubmissionNotice = {
  submitter: "张三", accountName: "账号一", videoTitle: "本周作品",
  publishedAt: "2026-11-24T01:20:00.000Z", submittedAt: "2026-11-24T03:08:00.000Z",
  metrics: { play_count: 12000, likes: 300, comments: 20, shares: 8, favorites: 16, completion_rate_5s: 45.6, completion_rate: null },
};

test("交互卡片包含责任人、作品、指标和上海时间", () => {
  const card = buildFeishuSubmissionCard(notice);
  const content = JSON.stringify(card);
  assert.equal(card.msg_type, "interactive");
  assert.equal(card.card.header.title.content, "📢 作品数据提交通知");
  for (const expected of ["张三", "账号一", "本周作品", "12,000", "300", "20", "8", "16", "45.6%", "-", "2026年11月24日 09:20", "2026年11月24日 11:08"]) {
    assert.ok(content.includes(expected), `卡片缺少 ${expected}`);
  }
});

test("指标空值、非有限数统一为 -，零仍展示为 0", () => {
  assert.equal(formatSubmissionMetric(null), "-");
  assert.equal(formatSubmissionMetric(undefined), "-");
  assert.equal(formatSubmissionMetric(Number.NaN), "-");
  assert.equal(formatSubmissionMetric(Number.POSITIVE_INFINITY), "-");
  assert.equal(formatSubmissionMetric(0), "0");
  assert.equal(formatSubmissionMetric(45.678, "%"), "45.68%");

  const card = buildFeishuSubmissionCard({
    ...notice, submitter: null, accountName: "", videoTitle: undefined, publishedAt: "bad date",
    metrics: { play_count: null, likes: null, comments: null, shares: null, favorites: null, completion_rate_5s: null, completion_rate: null },
  });
  const content = JSON.stringify(card);
  assert.ok(content.includes("未填写/未识别"));
  assert.ok(!content.includes("undefined"));
  assert.ok(!content.includes("NaN"));
});

test("上海时间格式到分钟，发布时间缺失时明确标注未识别", () => {
  assert.equal(formatSubmissionShanghaiTime("2026-11-24T03:08:59.000Z"), "2026年11月24日 11:08");
  assert.equal(formatSubmissionShanghaiTime(null), "未填写/未识别");
  assert.equal(formatSubmissionShanghaiTime("not-a-date"), "未填写/未识别");
});

test("飞书发送失败只记录错误，不向提交主链路抛出异常", async () => {
  const errors: unknown[][] = [];
  const result = await dispatchFeishuSubmissionNotice(notice, {
    send: async () => ({ ok: false, reason: "timeout" }),
    logError: (...args) => errors.push(args),
  });

  assert.deepEqual(result, { ok: false, reason: "timeout" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.[0], "[video-submit] 作品日报飞书播报失败");
});

test("发送器意外抛错时也被隔离为失败结果", async () => {
  const errors: unknown[][] = [];
  const result = await dispatchFeishuSubmissionNotice(notice, {
    send: async () => { throw new Error("network down"); },
    logError: (...args) => errors.push(args),
  });

  assert.deepEqual(result, { ok: false, reason: "network" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.[0], "[video-submit] 作品日报飞书播报异常");
});

test("只有首次创建日报触发通知，已有日报编辑不触发", () => {
  assert.equal(shouldNotifyFirstDailyReport(null), true);
  assert.equal(shouldNotifyFirstDailyReport(undefined), true);
  assert.equal(shouldNotifyFirstDailyReport({ id: "existing-report" }), false);
});

test("首次日报调度一次飞书发送，编辑已有日报不发送", async () => {
  let sendCalls = 0;
  const deps = { send: async () => { sendCalls += 1; return { ok: true as const }; }, logError: () => {} };

  scheduleFirstDailyReportNotice(null, notice, deps);
  scheduleFirstDailyReportNotice({ id: "existing-report" }, notice, deps);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sendCalls, 1);
});
