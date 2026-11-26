import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeishuSubmissionCard,
  computeNetFollowerGain,
  dispatchFeishuSubmissionNotice,
  formatSubmissionMetric,
  formatSubmissionReportDate,
  formatSubmissionShanghaiTime,
  scheduleFirstDailyReportNotice,
  shouldNotifyFirstDailyReport,
  type FeishuSubmissionNotice,
} from "./feishu-report-notice";

const notice: FeishuSubmissionNotice = {
  submitter: "张三",
  reportDate: "2026-11-24",
  videoTitle: "本周作品",
  videoUrl: "https://www.douyin.com/video/123456",
  publishedAt: "2026-11-24T01:20:00.000Z",
  submittedAt: "2026-11-24T03:08:00.000Z",
  metrics: {
    play_count: 12000,
    likes: 300,
    comments: 20,
    shares: 8,
    favorites: 16,
    follower_gain: 50,
    follower_loss: 8,
    avg_play_duration: 18.5,
    bounce_rate_2s: 31.2,
    completion_rate_5s: 45.6,
    completion_rate: null,
  },
};

test("交互卡片为 5 行 Schema 1.0 高密度网格结构，无顶栏与 # 噪音", () => {
  const card = buildFeishuSubmissionCard(notice);
  const content = JSON.stringify(card);

  assert.equal(card.msg_type, "interactive");
  assert.equal("header" in card.card, false);
  assert.equal(card.card.elements.length, 5);

  const [row1, row2, row3, row4, row5] = card.card.elements;
  assert.equal(row1?.tag, "column_set");
  if (row1?.tag === "column_set") {
    assert.equal(row1.flex_mode, "stretch");
    assert.equal(row1.background_style, "grey");
    assert.equal(row1.columns.length, 4);
  }

  assert.equal(row2?.tag, "div");
  if (row2?.tag === "div") {
    assert.equal(row2.text.content, "[**《本周作品》**](https://www.douyin.com/video/123456)");
  }

  assert.equal(row3?.tag, "column_set");
  if (row3?.tag === "column_set") {
    assert.equal(row3.flex_mode, "stretch");
    assert.equal(row3.columns.length, 5);
  }

  assert.equal(row4?.tag, "column_set");
  if (row4?.tag === "column_set") {
    assert.equal(row4.flex_mode, "stretch");
    assert.equal(row4.columns.length, 4);
  }

  assert.equal(row5?.tag, "note");
  if (row5?.tag === "note") {
    assert.equal(row5.elements[0]?.content, "发布 11-24 09:20  ·  提交 11-24 11:08");
  }

  assert.ok(!content.includes("# 12,000"));
  assert.ok(!content.includes("📢"));
  assert.ok(!content.includes("作品标题"));
  assert.ok(!content.includes("（上海）"));
  for (const expected of ["张三", "11-24", "12,000", "42", "300", "20", "8", "16", "2.87%", "45.6%", "-", "18.5s", "31.2%"]) {
    assert.ok(content.includes(expected), `卡片缺少 ${expected}`);
  }
});

test("标题无链接或非法协议时降级为纯加粗《标题》", () => {
  const withoutUrl = buildFeishuSubmissionCard({ ...notice, videoUrl: null });
  assert.equal(withoutUrl.card.elements[1]?.tag, "div");
  assert.equal((withoutUrl.card.elements[1] as { text: { content: string } }).text.content, "**《本周作品》**");

  const unsafeUrl = buildFeishuSubmissionCard({ ...notice, videoUrl: "javascript:alert(1)" });
  assert.equal((unsafeUrl.card.elements[1] as { text: { content: string } }).text.content, "**《本周作品》**");
});

test("净涨粉与日期格式化处理掉粉、缺省与回退逻辑", () => {
  assert.equal(computeNetFollowerGain({ follower_gain: 50, follower_loss: 0 }), 50);
  assert.equal(computeNetFollowerGain({ follower_gain: 50, follower_loss: null }), 50);
  assert.equal(computeNetFollowerGain({ follower_gain: 10, follower_loss: 15 }), -5);
  assert.equal(computeNetFollowerGain({ follower_gain: null, follower_loss: 5 }), null);

  assert.equal(formatSubmissionReportDate("2026-11-24", null), "11-24");
  assert.equal(formatSubmissionReportDate(null, "2026-11-24T17:00:00.000Z"), "11-25");
  assert.equal(formatSubmissionReportDate(null, "bad-date"), "-");
});

test("指标空值、非有限数与脏数据统一为 -，零仍展示为 0", () => {
  assert.equal(formatSubmissionMetric(null), "-");
  assert.equal(formatSubmissionMetric(undefined), "-");
  assert.equal(formatSubmissionMetric(Number.NaN), "-");
  assert.equal(formatSubmissionMetric(Number.POSITIVE_INFINITY), "-");
  assert.equal(formatSubmissionMetric(0), "0");
  assert.equal(formatSubmissionMetric(45.678, "%"), "45.68%");

  const card = buildFeishuSubmissionCard({
    ...notice,
    submitter: null,
    reportDate: null,
    videoTitle: undefined,
    videoUrl: undefined,
    publishedAt: "bad date",
    metrics: {
      play_count: 0,
      likes: 10,
      comments: null,
      shares: null,
      favorites: null,
      follower_gain: null,
      follower_loss: null,
      avg_play_duration: null,
      bounce_rate_2s: null,
      completion_rate_5s: null,
      completion_rate: null,
    },
  });
  const content = JSON.stringify(card);
  assert.ok(content.includes("发布 未识别"));
  assert.ok(!content.includes("undefined"));
  assert.ok(!content.includes("NaN"));
  // 播放为 0 时互动率为 -，不应标绿高亮
  const row3 = card.card.elements[2] as { columns: Array<{ elements: Array<{ text: { content: string } }> }> };
  assert.equal(row3.columns[4]?.elements[0]?.text.content, "<font color='grey'>互动率</font>\n**-**");
});

test("上海时间格式到 MM-DD HH:mm，发布时间缺失时明确标注未识别", () => {
  assert.equal(formatSubmissionShanghaiTime("2026-11-24T03:08:59.000Z"), "11-24 11:08");
  assert.equal(formatSubmissionShanghaiTime(null), "未识别");
  assert.equal(formatSubmissionShanghaiTime("not-a-date"), "未识别");
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
