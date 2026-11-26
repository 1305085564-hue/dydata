import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";
import {
  buildFeishuSubmissionCard,
  computeNetFollowerGain,
  dispatchFeishuSubmissionNotice,
  formatNetFollowerGain,
  formatRetentionAchievement,
  formatSubmissionMetric,
  formatSubmissionReportDate,
  formatSubmissionShanghaiTime,
  scheduleFirstDailyReportNotice,
  shouldNotifyFirstDailyReport,
  type FeishuSubmissionNotice,
} from "./feishu-report-notice";

const yeyanNotice: FeishuSubmissionNotice = {
  submitter: "叶颜",
  reportDate: "2026-11-25",
  videoTitle: "11.25 黎明前的黑暗",
  videoUrl: "https://www.douyin.com/video/123456",
  topicTag: "复盘",
  publishedAt: "2026-11-25T10:45:00.000Z",
  submittedAt: "2026-11-26T11:58:00.000Z",
  metrics: {
    play_count: 34000,
    likes: 705,
    comments: 141,
    shares: 29,
    favorites: 132,
    follower_gain: 290,
    follower_loss: 0,
    avg_play_duration: 44,
    avg_play_ratio: null,
    bounce_rate_2s: 26.67,
    completion_rate_5s: 55.56,
    completion_rate: 6.83,
  },
};

function getColumnValues(columnSet: {
  tag: "column_set";
  columns: Array<{ elements: Array<{ content: string }> }>;
}) {
  return columnSet.columns.map((col) => ({
    label: col.elements[0]?.content ?? "",
    value: col.elements[1]?.content ?? "",
  }));
}

test("飞书卡片 2.0 结构：标题置顶带评级/话题标签、2 列核心流量、5×2 对齐网格含留存达成", () => {
  const card = buildFeishuSubmissionCard(yeyanNotice);
  const serialized = JSON.stringify(card);

  assert.equal(card.msg_type, "interactive");
  assert.equal(card.card.schema, "2.0");
  assert.equal("header" in card.card, false);
  assert.equal(card.card.config.width_mode, "default");

  const elements = card.card.body.elements;
  assert.equal(elements.length, 10);

  // 1-2: 顶部标题（可点击 + 综合评级良 + 复盘标签）与作者日期副标
  const [titleEl, metaEl, heroEl, interactionLabelEl, interactionEl, hr1, retentionLabelEl, retentionEl, hr2, footerEl] = elements;
  assert.equal(titleEl?.tag, "markdown");
  if (titleEl?.tag === "markdown") {
    assert.equal(titleEl.text_size, "heading");
    assert.equal(
      titleEl.content,
      "[**《11\\.25 黎明前的黑暗》**](https://www.douyin.com/video/123456) <text_tag color='carmine'>良</text_tag> <text_tag color='neutral'>复盘</text_tag>",
    );
  }
  assert.equal(metaEl?.tag, "markdown");
  if (metaEl?.tag === "markdown") {
    assert.equal(metaEl.text_size, "notation");
    assert.equal(metaEl.content, "<font color='grey'>叶颜  ·  11-25</font>");
  }

  // 3: 灰底 2 列核心流量卡块
  assert.equal(heroEl?.tag, "column_set");
  if (heroEl?.tag === "column_set") {
    assert.equal(heroEl.flex_mode, "bisect");
    assert.equal(heroEl.background_style, "grey");
    assert.deepEqual(getColumnValues(heroEl), [
      { label: "<font color='grey'>播放量</font>", value: "**34,000**" },
      { label: "<font color='grey'>净涨粉</font>", value: "**+290**" },
    ]);
  }

  // 4-5: 互动表现 5 列（2.96% 处于普通区间，绝不标绿）
  assert.equal(interactionLabelEl?.tag, "markdown");
  if (interactionLabelEl?.tag === "markdown") {
    assert.equal(interactionLabelEl.content, "<font color='grey'>互动表现</font>");
  }
  assert.equal(interactionEl?.tag, "column_set");
  if (interactionEl?.tag === "column_set") {
    assert.equal(interactionEl.flex_mode, "none");
    assert.equal(interactionEl.columns.length, 5);
    assert.deepEqual(getColumnValues(interactionEl), [
      { label: "<font color='grey'>点赞</font>", value: "**705**" },
      { label: "<font color='grey'>评论</font>", value: "**141**" },
      { label: "<font color='grey'>分享</font>", value: "**29**" },
      { label: "<font color='grey'>收藏</font>", value: "**132**" },
      { label: "<font color='grey'>互动率</font>", value: "**2.96%**" },
    ]);
  }

  assert.equal(hr1?.tag, "hr");

  // 7-8: 留存表现 5 列（按观看漏斗顺序 + 第 5 列留存达成 88% 与互动率对齐）
  assert.equal(retentionLabelEl?.tag, "markdown");
  if (retentionLabelEl?.tag === "markdown") {
    assert.equal(retentionLabelEl.content, "<font color='grey'>留存表现</font>");
  }
  assert.equal(retentionEl?.tag, "column_set");
  if (retentionEl?.tag === "column_set") {
    assert.equal(retentionEl.flex_mode, "none");
    assert.equal(retentionEl.columns.length, 5);
    assert.deepEqual(getColumnValues(retentionEl), [
      { label: "<font color='grey'>2秒跳出</font>", value: "**26.67%**" },
      { label: "<font color='grey'>5秒完播</font>", value: "**55.56%**" },
      { label: "<font color='grey'>均播时长</font>", value: "**44s**" },
      { label: "<font color='grey'>整体完播</font>", value: "**6.83%**" },
      { label: "<font color='grey'>留存达成</font>", value: "**88%**" },
    ]);
  }

  assert.equal(hr2?.tag, "hr");

  // 10: 底部时间元信息
  assert.equal(footerEl?.tag, "markdown");
  if (footerEl?.tag === "markdown") {
    assert.equal(footerEl.text_size, "notation");
    assert.equal(footerEl.content, "<font color='grey'>发布 11-25 18:45  ·  提交 11-26 19:58</font>");
  }

  assert.ok(!serialized.includes("<font color='green'>"));
  assert.ok(!serialized.includes("📢"));
});

test("好红差绿口径：达标标红、跌破标绿、低播样本不上色，互动四项不上红绿", () => {
  const excellentCard = buildFeishuSubmissionCard({
    ...yeyanNotice,
    topicTag: "干货",
    metrics: {
      play_count: 68500,
      likes: 1820,
      comments: 312,
      shares: 185,
      favorites: 740,
      follower_gain: 640,
      follower_loss: 0,
      avg_play_duration: 56,
      avg_play_ratio: null,
      bounce_rate_2s: 21.4,
      completion_rate_5s: 64.2,
      completion_rate: 11.8,
    },
  });
  const excellentElements = excellentCard.card.body.elements;
  assert.match((excellentElements[0] as { content: string }).content, /<text_tag color='purple'>优<\/text_tag>/);
  assert.match((excellentElements[0] as { content: string }).content, /<text_tag color='neutral'>干货<\/text_tag>/);
  const excInteraction = getColumnValues(excellentElements[4] as never);
  assert.equal(excInteraction[0]?.value, "**1,820**"); // 点赞不上红绿
  assert.equal(excInteraction[4]?.value, "<font color='red'>**4.46%**</font>");
  const excRetention = getColumnValues(excellentElements[7] as never);
  assert.equal(excRetention[0]?.value, "<font color='red'>**21.4%**</font>");
  assert.equal(excRetention[1]?.value, "<font color='red'>**64.2%**</font>");
  assert.equal(excRetention[2]?.value, "<font color='red'>**56s**</font>");
  assert.equal(excRetention[3]?.value, "<font color='red'>**11.8%**</font>");
  assert.equal(excRetention[4]?.value, "<font color='red'>**113%**</font>");

  const poorCard = buildFeishuSubmissionCard({
    ...yeyanNotice,
    metrics: {
      play_count: 12400,
      likes: 148,
      comments: 32,
      shares: 6,
      favorites: 24,
      follower_gain: 35,
      follower_loss: 0,
      avg_play_duration: 26,
      avg_play_ratio: null,
      bounce_rate_2s: 40.5,
      completion_rate_5s: 43.5,
      completion_rate: 3.8,
    },
  });
  const poorElements = poorCard.card.body.elements;
  assert.match((poorElements[0] as { content: string }).content, /<text_tag color='neutral'>普<\/text_tag>/);
  assert.equal(getColumnValues(poorElements[4] as never)[4]?.value, "<font color='green'>**1.69%**</font>");
  const poorRetention = getColumnValues(poorElements[7] as never);
  assert.equal(poorRetention[0]?.value, "<font color='green'>**40.5%**</font>");
  assert.equal(poorRetention[1]?.value, "<font color='green'>**43.5%**</font>");
  assert.equal(poorRetention[2]?.value, "<font color='green'>**26s**</font>");
  assert.equal(poorRetention[3]?.value, "<font color='green'>**3.8%**</font>");
  assert.equal(poorRetention[4]?.value, "<font color='green'>**59%**</font>");

  // 播放不足 5,000 门槛：即使数值全优或全差也不标红绿
  const lowPlayCard = buildFeishuSubmissionCard({
    ...yeyanNotice,
    metrics: {
      play_count: 3200,
      likes: 36,
      comments: 9,
      shares: 2,
      favorites: 11,
      follower_gain: 18,
      follower_loss: 0,
      avg_play_duration: 24,
      avg_play_ratio: null,
      bounce_rate_2s: 40.5,
      completion_rate_5s: 43.5,
      completion_rate: 3.8,
    },
  });
  const lowPlaySerialized = JSON.stringify(lowPlayCard);
  assert.ok(!lowPlaySerialized.includes("<font color='red'>"));
  assert.ok(!lowPlaySerialized.includes("<font color='green'>"));
});

test("支持平均播放占比折算与自定义团队评价标准", () => {
  const customStandards: EvaluationStandards = {
    ...structuredClone(DEFAULT_EVALUATION_STANDARDS),
    minPlayCount: 2000,
    targets: { interactionRate: 2.5, followerRate: 1 },
  };
  const card = buildFeishuSubmissionCard({
    ...yeyanNotice,
    standards: customStandards,
    metrics: {
      ...yeyanNotice.metrics,
      play_count: 3000,
      likes: 60,
      comments: 15,
      shares: 5,
      favorites: 10, // 90/3000 = 3.0% >= 2.5% 自定义好线
      avg_play_duration: 50, // 100%
      avg_play_ratio: 50, // 50% / 25% = 200%，与均播取均值 150%
      bounce_rate_2s: 25, // 100%
      completion_rate_5s: 60, // 100%
      completion_rate: 10, // 100%
    },
  });
  const elements = card.card.body.elements;
  // 留存达成 = 100*0.35 + 100*0.30 + 150*0.20 + 100*0.15 = 110%
  assert.equal(getColumnValues(elements[4] as never)[4]?.value, "<font color='red'>**3%**</font>");
  assert.equal(getColumnValues(elements[7] as never)[4]?.value, "<font color='red'>**110%**</font>");
});

test("标题无链接或非法协议时降级为纯加粗《标题》，无话题与无评级时不渲染多余标签", () => {
  const withoutUrl = buildFeishuSubmissionCard({
    ...yeyanNotice,
    videoUrl: null,
    topicTag: null,
    metrics: { ...yeyanNotice.metrics, completion_rate: null },
  });
  assert.equal((withoutUrl.card.body.elements[0] as { content: string }).content, "**《11\\.25 黎明前的黑暗》**");

  const unsafeUrl = buildFeishuSubmissionCard({
    ...yeyanNotice,
    videoUrl: "javascript:alert(1)",
    topicTag: "  ",
    metrics: { ...yeyanNotice.metrics, completion_rate: null },
  });
  assert.equal((unsafeUrl.card.body.elements[0] as { content: string }).content, "**《11\\.25 黎明前的黑暗》**");
});

test("净涨粉、留存达成与日期格式化处理正负零与缺省回退", () => {
  assert.equal(computeNetFollowerGain({ follower_gain: 50, follower_loss: 0 }), 50);
  assert.equal(computeNetFollowerGain({ follower_gain: 50, follower_loss: null }), 50);
  assert.equal(computeNetFollowerGain({ follower_gain: 10, follower_loss: 15 }), -5);
  assert.equal(computeNetFollowerGain({ follower_gain: null, follower_loss: 5 }), null);

  assert.equal(formatNetFollowerGain(1290), "+1,290");
  assert.equal(formatNetFollowerGain(0), "0");
  assert.equal(formatNetFollowerGain(-5), "-5");
  assert.equal(formatNetFollowerGain(null), "-");

  assert.equal(formatRetentionAchievement(88.43), "88%");
  assert.equal(formatRetentionAchievement(null), "-");

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
    ...yeyanNotice,
    submitter: null,
    reportDate: null,
    videoTitle: undefined,
    videoUrl: undefined,
    topicTag: null,
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
      avg_play_ratio: null,
      bounce_rate_2s: null,
      completion_rate_5s: null,
      completion_rate: null,
    },
  });
  const content = JSON.stringify(card);
  assert.ok(content.includes("发布 未识别"));
  assert.ok(!content.includes("undefined"));
  assert.ok(!content.includes("NaN"));
  assert.ok(!content.includes("<text_tag"));
  assert.equal(getColumnValues(card.card.body.elements[4] as never)[4]?.value, "**-**");
  assert.equal(getColumnValues(card.card.body.elements[7] as never)[4]?.value, "**-**");
});

test("上海时间格式到 MM-DD HH:mm，发布时间缺失时明确标注未识别", () => {
  assert.equal(formatSubmissionShanghaiTime("2026-11-24T03:08:59.000Z"), "11-24 11:08");
  assert.equal(formatSubmissionShanghaiTime(null), "未识别");
  assert.equal(formatSubmissionShanghaiTime("not-a-date"), "未识别");
});

test("dispatch 优先按 teamId 加载团队评价标准，读取失败时记录日志并安全回退默认标准", async () => {
  let sentPayload: unknown = null;
  const customStandards: EvaluationStandards = {
    ...structuredClone(DEFAULT_EVALUATION_STANDARDS),
    targets: { interactionRate: 2.5, followerRate: 1 },
  };
  const okResult = await dispatchFeishuSubmissionNotice(
    { ...yeyanNotice, teamId: "team-custom" },
    {
      loadStandards: async (teamId) => {
        assert.equal(teamId, "team-custom");
        return customStandards;
      },
      send: async (payload) => {
        sentPayload = payload;
        return { ok: true };
      },
      logError: () => {},
    },
  );
  assert.deepEqual(okResult, { ok: true });
  // 2.96% 在自定义 2.5% 基准下应标红
  assert.ok(JSON.stringify(sentPayload).includes("<font color='red'>**2.96%**</font>"));

  // 加载标准异常时自动回退默认标准并继续发送
  const errors: unknown[][] = [];
  let fallbackPayload: unknown = null;
  const fallbackResult = await dispatchFeishuSubmissionNotice(
    { ...yeyanNotice, teamId: "team-broken" },
    {
      loadStandards: async () => { throw new Error("db timeout"); },
      send: async (payload) => {
        fallbackPayload = payload;
        return { ok: true };
      },
      logError: (...args) => errors.push(args),
    },
  );
  assert.deepEqual(fallbackResult, { ok: true });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.[0], "[video-submit] 飞书播报读取团队评价标准失败，已回退默认标准");
  // 默认标准下 2.96% 为普通色，不标红绿
  assert.ok(JSON.stringify(fallbackPayload).includes("**2.96%**"));
  assert.ok(!JSON.stringify(fallbackPayload).includes("<font color='red'>**2.96%**</font>"));
});

test("飞书发送失败只记录错误，不向提交主链路抛出异常", async () => {
  const errors: unknown[][] = [];
  const result = await dispatchFeishuSubmissionNotice(yeyanNotice, {
    send: async () => ({ ok: false, reason: "timeout" }),
    logError: (...args) => errors.push(args),
  });

  assert.deepEqual(result, { ok: false, reason: "timeout" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.[0], "[video-submit] 作品日报飞书播报失败");
});

test("发送器意外抛错时也被隔离为失败结果", async () => {
  const errors: unknown[][] = [];
  const result = await dispatchFeishuSubmissionNotice(yeyanNotice, {
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

  scheduleFirstDailyReportNotice(null, yeyanNotice, deps);
  scheduleFirstDailyReportNotice({ id: "existing-report" }, yeyanNotice, deps);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sendCalls, 1);
});
