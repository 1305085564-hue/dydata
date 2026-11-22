import assert from "node:assert/strict";
import test from "node:test";

import type { ContentQualitySummary } from "@/lib/collaboration/content-quality-contract";
import { teamMetricColumns } from "./collaboration-quality-hints";
import type { WorkGroupMemberRow } from "@/lib/collaboration/types";

/**
 * 小队列表与小队详情的列：和文案表同一套列名、口径；「展开明细」拆出互动四项与留存五项。
 */

const quality = {
  retentionAverages: {
    bounceRate2s: 28.46,
    completionRate5s: 62,
    avgPlayDuration: 14.4,
    avgPlayRatio: 35.25,
    completionRate: null,
  },
} as ContentQualitySummary;

function member(overrides: Partial<WorkGroupMemberRow> = {}): WorkGroupMemberRow {
  return {
    userId: "u-1",
    name: "张三",
    contentQuality: null,
    reportCount: 3,
    snapshotCount: 3,
    totalPlay: 30000,
    avgPlay: 10000,
    followerConversionRate: 0.01,
    interactionRate: 0.045,
    likeRate: 0.025,
    commentRate: 0.005,
    shareRate: null,
    favoriteRate: 0.0125,
    ...overrides,
  };
}

test("默认列：本月作品、总播放、条均播放、转粉率、互动率 + 互动达成、留存达成、良优率", () => {
  const labels = teamMetricColumns<WorkGroupMemberRow>({ showDetail: false, withQuality: true }).map((c) => c.label);
  assert.deepEqual(labels, ["本月作品", "总播放", "条均播放", "转粉率", "互动率", "互动达成", "留存达成", "良优率"]);
});

test("运营小队（全队没有质量数据）不出评级列", () => {
  const labels = teamMetricColumns<WorkGroupMemberRow>({ showDetail: true, withQuality: false }).map((c) => c.label);
  assert.deepEqual(labels, ["本月作品", "总播放", "条均播放", "转粉率", "互动率", "点赞率", "评论率", "转发率", "收藏率"]);
});

test("展开明细：互动四项紧跟互动率，留存五项跟在评级列后；缺值显示 —", () => {
  const columns = teamMetricColumns<WorkGroupMemberRow>({ showDetail: true, withQuality: true });
  assert.deepEqual(
    columns.map((c) => c.label),
    ["本月作品", "总播放", "条均播放", "转粉率", "互动率", "点赞率", "评论率", "转发率", "收藏率", "互动达成", "留存达成", "良优率", "2秒跳出率", "5秒完播率", "均播时长", "播放占比", "整体完播率"],
  );
  const row = member({ contentQuality: quality });
  const pick = (keys: string[]) => keys.map((key) => columns.find((c) => c.key === key)!.render(row));
  assert.deepEqual(pick(["likeRate", "commentRate", "shareRate", "favoriteRate"]), ["2.5%", "0.5%", "—", "1.3%"]);
  assert.deepEqual(
    pick(["bounceRate2s", "completionRate5s", "avgPlayDuration", "avgPlayRatio", "completionRate"]),
    ["28.5%", "62%", "14s", "35.3%", "—"],
  );
});

test("小队口径：播放按快照统计，列头说明与岗位表不同", () => {
  const columns = teamMetricColumns<WorkGroupMemberRow>({ showDetail: false, withQuality: false });
  assert.match(String(columns.find((c) => c.key === "totalPlay")!.tip), /最新 24 小时快照/);
  assert.match(String(columns.find((c) => c.key === "avgPlay")!.tip), /已同步数据复盘的作品数/);
});
