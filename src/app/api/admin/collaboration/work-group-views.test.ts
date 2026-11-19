import assert from "node:assert/strict";
import test from "node:test";

import {
  type WorkGroupDetailView,
  type WorkGroupMemberRow,
} from "@/lib/collaboration/domain/types";
import { buildWorkGroupViews } from "@/lib/collaboration/domain/work-group-rules";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

import { dataset } from "./work-group-views.fixtures";

function viewOf(views: ReturnType<typeof buildWorkGroupViews>, groupId: string): WorkGroupDetailView {
  const view = views.details.find((item) => item.summary.id === groupId);
  assert.ok(view, `缺少小队详情：${groupId}`);
  return view;
}

function memberOf(view: WorkGroupDetailView, userId: string): WorkGroupMemberRow {
  const member = view.members.find((item) => item.userId === userId);
  assert.ok(member, `${view.summary.name} 缺少组员行：${userId}`);
  return member;
}

function assertClose(actual: number | null, expected: number, label: string) {
  assert.notEqual(actual, null, `${label} 不应为 null`);
  assert.ok(
    Math.abs((actual as number) - expected) < 1e-12,
    `${label}：期望 ${expected}，实际 ${actual}`,
  );
}

test("组员绩效与抽屉同源：先加总再相除（加权），条均不被未同步作品稀释", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  const lead = memberOf(writer, "writer-1");
  // 三篇署名，其中两篇取到 24h 快照
  assert.equal(lead.reportCount, 3);
  assert.equal(lead.snapshotCount, 2);
  // 播放与条均只用快照作品：60000 / 2 = 30000（不用 3 篇稀释）
  assert.equal(lead.totalPlay, 60000);
  assert.equal(lead.avgPlay, 30000);
  // 各比率 = 分子合计 ÷ 播放合计
  assertClose(lead.followerConversionRate, 700 / 60000, "转粉率");
  assertClose(lead.interactionRate, 2700 / 60000, "互动率");
  assertClose(lead.likeRate, 1500 / 60000, "点赞率");
  assertClose(lead.favoriteRate, 750 / 60000, "收藏率");
  // 展开明细：评论率、转发率同口径，四项相加等于互动率
  assertClose(lead.commentRate, 300 / 60000, "评论率");
  assertClose(lead.shareRate, 150 / 60000, "转发率");
  assertClose(
    (lead.likeRate ?? 0) + (lead.commentRate ?? 0) + (lead.shareRate ?? 0) + (lead.favoriteRate ?? 0),
    lead.interactionRate as number,
    "四项之和",
  );
});

test("组综合 = 组内全部署名作品一次聚合，不是成员比率的平均", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.memberCount, 3, "兼岗成员在文案组也占一个编制位");
  assert.deepEqual(
    { reportCount: writer.summary.aggregate.reportCount, snapshotCount: writer.summary.aggregate.snapshotCount },
    { reportCount: 3, snapshotCount: 2 },
    "组综合聚合组内全部署名作品（writer-2、operator-1 无署名产出）",
  );
  assert.equal(writer.summary.aggregate.totalPlay, 60000);
  assert.equal(writer.summary.aggregate.avgPlay, 30000);
  assertClose(writer.summary.aggregate.interactionRate, 2700 / 60000, "组互动率");

  const talent = viewOf(views, "wg-talent");
  assert.deepEqual(
    { reportCount: talent.summary.aggregate.reportCount, snapshotCount: talent.summary.aggregate.snapshotCount },
    { reportCount: 2, snapshotCount: 1 },
  );
  assert.equal(talent.summary.aggregate.totalPlay, 50000);
  assert.equal(talent.summary.aggregate.avgPlay, 50000);

  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.summary.aggregate.reportCount, 1);
  assert.equal(operator.summary.aggregate.totalPlay, 20000);
});

test("文案和达人小队质量汇总按全部作品重算，运营保持空值", () => {
  const views = buildWorkGroupViews({
    ...dataset,
    videoTopicTags: {
      state: "ready",
      tags: new Map([["v-1", "干货"], ["v-2", "复盘"], ["v-3", "复盘"], ["v-4", "复盘"]]),
    },
  });
  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.contentQuality?.totalCount, 3);
  assert.equal(writer.summary.contentQuality?.ratedCount, 2, "只有取到 24h 快照的作品进入综合评级分母");
  const talent = viewOf(views, "wg-talent").summary.contentQuality;
  assert.equal(talent?.totalCount, 2);
  assert.equal(talent?.ratedCount, 1, "达人按账号主人归属，只有 v-2 有完整快照");
  assert.equal(viewOf(views, "wg-operator").summary.contentQuality, null);
  // 展开明细的五项留存原始值：v-1、v-2 两篇都过统计门槛，快照数值相同，平均即原值（平均播放占比按百分数）
  const lead = memberOf(writer, "writer-1");
  assert.deepEqual(lead.contentQuality?.retentionAverages, {
    bounceRate2s: 25,
    completionRate5s: 60,
    avgPlayDuration: 40,
    avgPlayRatio: 25,
    completionRate: 10,
  });
});

test("小队质量按显式公司标准重算互动与留存，不被 60 秒原始数据缓存固化", () => {
  const qualityDataset = {
    ...dataset,
    videoTopicTags: {
      state: "ready" as const,
      tags: new Map([["v-1", "干货"], ["v-2", "干货"], ["v-3", "复盘"]]),
    },
  };
  const stricterStandards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    targets: {
      reviewLikeRate: 10,
      dryFavoriteRate: 10,
      interactionRate: 20,
      followerRate: 2,
    },
  };

  const defaults = buildWorkGroupViews(qualityDataset);
  const configured = buildWorkGroupViews(qualityDataset, stricterStandards);
  const defaultQuality = viewOf(defaults, "wg-writer").summary.contentQuality;
  const configuredQuality = viewOf(configured, "wg-writer").summary.contentQuality;
  assert.ok(defaultQuality);
  assert.ok(configuredQuality);
  assert.ok((configuredQuality.avgInteractionAchievement ?? 0) < (defaultQuality.avgInteractionAchievement ?? 0));
  assert.ok(configuredQuality.avgContentAchievement != null);
  assert.deepEqual(configuredQuality.overallGradeCounts, { excellent: 0, good: 0, fair: 2 });
});

test("署名归属与按岗位口径一致：文案含达人账号作品、达人按账号归属、运营只算他人账号", () => {
  const views = buildWorkGroupViews(dataset);

  // w-own 发在 owner-1 的账号上：文案 writer-1 与达人 owner-1 各计各的
  const lead = memberOf(viewOf(views, "wg-writer"), "writer-1");
  assert.equal(lead.reportCount, 3, "文案署名含达人账号上的作品");
  const talentLead = memberOf(viewOf(views, "wg-talent"), "owner-1");
  assert.equal(talentLead.reportCount, 2, "达人按账号归属计入 w-own 与 t-2");

  // o-1 是悬空账号（无归属人）：不计任何达人的行，但运营 operator-1 计入
  const idleTalent = memberOf(viewOf(views, "wg-talent"), "owner-2");
  assert.equal(idleTalent.reportCount, 0, "悬空账号不归属任何达人");
  const operatorLead = memberOf(viewOf(views, "wg-operator"), "operator-1");
  assert.equal(operatorLead.reportCount, 1);
  assert.equal(operatorLead.totalPlay, 20000);
});

test("兼岗各算各的：王运营在文案组零署名、在运营组有产出，两边都出行", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.memberCount, 3);
  const operatorInWriter = memberOf(writer, "operator-1");
  assert.equal(operatorInWriter.reportCount, 0);
  assert.equal(operatorInWriter.totalPlay, 0);
  assert.equal(operatorInWriter.interactionRate, null);

  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.summary.memberCount, 2);
  assert.equal(memberOf(operator, "operator-1").reportCount, 1);
});

test("零产出组员照常出行：数值 0、比率 —；零产出小队也进列表", () => {
  const views = buildWorkGroupViews(dataset);

  const idle = memberOf(viewOf(views, "wg-writer"), "writer-2");
  assert.deepEqual(
    {
      reportCount: idle.reportCount,
      snapshotCount: idle.snapshotCount,
      totalPlay: idle.totalPlay,
      avgPlay: idle.avgPlay,
    },
    { reportCount: 0, snapshotCount: 0, totalPlay: 0, avgPlay: 0 },
  );
  assert.equal(idle.followerConversionRate, null);
  assert.equal(idle.interactionRate, null);
  assert.equal(idle.likeRate, null);
  assert.equal(idle.commentRate, null);
  assert.equal(idle.shareRate, null);
  assert.equal(idle.favoriteRate, null);

  const empty = viewOf(views, "wg-writer-empty");
  assert.equal(empty.summary.memberCount, 0);
  assert.deepEqual(empty.members, []);
  assert.equal(empty.summary.aggregate.reportCount, 0);
  assert.equal(empty.summary.aggregate.totalPlay, 0);
  assert.equal(empty.summary.aggregate.favoriteRate, null);
});

test("数据集没有快照时降级：作品数照常，播放 0、比率 —，不炸整页", () => {
  const views = buildWorkGroupViews({ ...dataset, videoSnapshots: undefined });

  const lead = memberOf(viewOf(views, "wg-writer"), "writer-1");
  assert.equal(lead.reportCount, 3, "署名作品数不受快照缺失影响");
  assert.equal(lead.snapshotCount, 0);
  assert.equal(lead.totalPlay, 0);
  assert.equal(lead.avgPlay, 0);
  assert.equal(lead.interactionRate, null);
});

test("可见范围裁剪：组员只读自己时，人数与组员行同步收窄", () => {
  const views = buildWorkGroupViews({ ...dataset, visibleUserIds: ["writer-1"] });
  const writer = viewOf(views, "wg-writer");

  assert.equal(writer.summary.memberCount, 1);
  assert.deepEqual(writer.members.map((member) => member.userId), ["writer-1"]);
  assert.equal(writer.summary.aggregate.reportCount, 3, "裁剪后组综合只算可见成员的署名作品");
});

test("没加载小队目录（按岗位模式）时空结果；库未跑 migration 时 ready=false 而不是伪装空列表", () => {
  const skipped = buildWorkGroupViews({ ...dataset, workGroups: undefined });
  assert.deepEqual(skipped, { ready: true, groups: [], details: [] });

  const missingSchema = buildWorkGroupViews({
    ...dataset,
    workGroups: { ready: false, groups: [], roster: [] },
  });
  assert.deepEqual(missingSchema, { ready: false, groups: [], details: [] });
});
