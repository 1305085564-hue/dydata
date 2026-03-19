import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFeishuAlertCard,
  createNoSubmissionAlerts,
  createSpikeAlerts,
  createSteadyDeclineAlerts,
  dedupeAlerts,
  type SmartAlert,
} from "./smart-alert";

function iso(value: string) {
  return `${value}T09:00:00.000Z`;
}

test("连续下滑规则会在近3条播放都低于基线50%时触发", () => {
  const alerts = createSteadyDeclineAlerts([
    {
      accountId: "account-1",
      accountName: "主号",
      userId: "user-1",
      userName: "阿禅",
      baselinePlayCount: 1000,
      recentReports: [
        { reportDate: "2026-03-17", playCount: 400 },
        { reportDate: "2026-03-16", playCount: 450 },
        { reportDate: "2026-03-15", playCount: 300 },
      ],
    },
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.type, "连续下滑");
  assert.equal(alerts[0]?.accountName, "主号");
  assert.match(alerts[0]?.evidence ?? "", /基线1000/);
  assert.match(alerts[0]?.suggestion ?? "", /复盘/);
});

test("连续下滑规则在样本不足或未跌破阈值时不触发", () => {
  assert.equal(
    createSteadyDeclineAlerts([
      {
        accountId: "account-1",
        accountName: "主号",
        userId: "user-1",
        userName: "阿禅",
        baselinePlayCount: 1000,
        recentReports: [
          { reportDate: "2026-03-17", playCount: 400 },
          { reportDate: "2026-03-16", playCount: 700 },
          { reportDate: "2026-03-15", playCount: 300 },
        ],
      },
      {
        accountId: "account-2",
        accountName: "副号",
        userId: "user-2",
        userName: "小王",
        baselinePlayCount: 1000,
        recentReports: [
          { reportDate: "2026-03-17", playCount: 300 },
          { reportDate: "2026-03-16", playCount: 200 },
        ],
      },
    ]).length,
    0,
  );
});

test("突然爆发规则会在近3天爆款率明显高于前7天时触发", () => {
  const alerts = createSpikeAlerts([
    {
      tag: "美妆",
      recentDays: [
        { date: "2026-03-17", total: 3, hits: 2 },
        { date: "2026-03-16", total: 4, hits: 2 },
        { date: "2026-03-15", total: 3, hits: 1 },
      ],
      previousDays: [
        { date: "2026-03-14", total: 4, hits: 0 },
        { date: "2026-03-13", total: 5, hits: 1 },
        { date: "2026-03-12", total: 4, hits: 0 },
        { date: "2026-03-11", total: 3, hits: 0 },
        { date: "2026-03-10", total: 2, hits: 0 },
        { date: "2026-03-09", total: 3, hits: 0 },
        { date: "2026-03-08", total: 2, hits: 0 },
      ],
    },
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.type, "突然爆发");
  assert.equal(alerts[0]?.tag, "美妆");
  assert.match(alerts[0]?.evidence ?? "", /近3天爆款率/);
});

test("突然爆发规则在缺少样本或增幅不足时不触发", () => {
  assert.equal(
    createSpikeAlerts([
      {
        tag: "知识",
        recentDays: [{ date: "2026-03-17", total: 1, hits: 1 }],
        previousDays: [{ date: "2026-03-16", total: 1, hits: 0 }],
      },
      {
        tag: "剧情",
        recentDays: [
          { date: "2026-03-17", total: 3, hits: 1 },
          { date: "2026-03-16", total: 3, hits: 1 },
          { date: "2026-03-15", total: 4, hits: 1 },
        ],
        previousDays: [
          { date: "2026-03-14", total: 4, hits: 1 },
          { date: "2026-03-13", total: 4, hits: 1 },
          { date: "2026-03-12", total: 4, hits: 1 },
          { date: "2026-03-11", total: 4, hits: 1 },
          { date: "2026-03-10", total: 4, hits: 1 },
          { date: "2026-03-09", total: 4, hits: 1 },
          { date: "2026-03-08", total: 4, hits: 1 },
        ],
      },
    ]).length,
    0,
  );
});

test("连续未提交规则会为连续2天未提交成员生成告警", () => {
  const alerts = createNoSubmissionAlerts([
    { userId: "user-1", userName: "阿禅", missingDays: 2 },
    { userId: "user-2", userName: "小王", missingDays: 1 },
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.type, "填报异常");
  assert.equal(alerts[0]?.userName, "阿禅");
  assert.match(alerts[0]?.evidence ?? "", /连续2天未提交/);
});

test("24小时内同用户同类型告警会被去重", () => {
  const now = new Date(iso("2026-03-19"));
  const current: SmartAlert[] = [
    {
      id: "new-1",
      type: "填报异常",
      userId: "user-1",
      userName: "阿禅",
      accountId: null,
      accountName: null,
      tag: null,
      evidence: "连续2天未提交",
      suggestion: "提醒补交",
      createdAt: now.toISOString(),
      dedupeKey: "user-1:填报异常",
    },
  ];

  const existing: SmartAlert[] = [
    {
      id: "old-1",
      type: "填报异常",
      userId: "user-1",
      userName: "阿禅",
      accountId: null,
      accountName: null,
      tag: null,
      evidence: "连续2天未提交",
      suggestion: "提醒补交",
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      dedupeKey: "user-1:填报异常",
    },
    {
      id: "old-2",
      type: "连续下滑",
      userId: "user-1",
      userName: "阿禅",
      accountId: "account-1",
      accountName: "主号",
      tag: null,
      evidence: "近3条播放持续低于基线",
      suggestion: "复盘内容",
      createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
      dedupeKey: "account-1:连续下滑",
    },
  ];

  const deduped = dedupeAlerts(current, existing, now);

  assert.equal(deduped.length, 0);
});

test("飞书卡片会包含告警类型、证据和建议动作", () => {
  const payload = buildFeishuAlertCard([
    {
      id: "alert-1",
      type: "连续下滑",
      userId: "user-1",
      userName: "阿禅",
      accountId: "account-1",
      accountName: "主号",
      tag: null,
      evidence: "近3条播放 400/450/300，低于基线1000的50%",
      suggestion: "复盘近3条选题与开头，必要时调整发布时间",
      createdAt: iso("2026-03-19"),
      dedupeKey: "account-1:连续下滑",
    },
  ]);

  assert.equal(payload.msg_type, "interactive");
  assert.equal(payload.card.header.title.content, "🚨 3E 智能预警");
  const content = JSON.stringify(payload.card.elements);
  assert.match(content, /阿禅/);
  assert.match(content, /主号/);
  assert.match(content, /连续下滑/);
  assert.match(content, /建议动作/);
});
