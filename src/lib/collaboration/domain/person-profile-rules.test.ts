import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthSummary,
  buildMonthlyTrend,
  buildRecentAnomalies,
  buildStrengths,
  buildTopWorks,
  derivePersonRoles,
  type PersonProfileWork,
} from "./person-profile-rules";
import type { CollaborationReport, VideoSnapshotMetrics } from "./types";

function work(reportId: string, overrides: Partial<PersonProfileWork> = {}): PersonProfileWork {
  return {
    reportId,
    videoId: `video-${reportId}`,
    title: `作品 ${reportId}`,
    accountName: "示例账号",
    workDate: "2026-10-01",
    hasSnapshot: true,
    playCount: 2000,
    interactionRate: 0.1,
    likeRate: 0.05,
    favoriteRate: 0.02,
    overallGrade: null,
    subject: "干货",
    anomaly: null,
    roles: ["writer"],
    ...overrides,
  };
}

function row(reportId: string): CollaborationReport {
  return {
    id: reportId,
    user_id: "user-1",
    report_date: "2026-10-01",
    account_id: "account-1",
    video_id: `video-${reportId}`,
    title: `作品 ${reportId}`,
    play_count: 0,
    follower_convert: 0,
    script_author_user_id: "user-1",
    video_editor_user_id: null,
    operator_user_id: null,
  };
}

function snapshot(
  videoId: string,
  playCount: number,
  likes: number,
  followerGain: number,
): VideoSnapshotMetrics {
  return { videoId, playCount, likes, comments: 0, shares: 0, favorites: 0, followerGain };
}

test("buildMonthlyTrend 近 6 个月含空月补行且时间升序", () => {
  const works = [
    work("r-1", { workDate: "2026-08-10", overallGrade: "优" }),
    work("r-2", { workDate: "2026-10-02", overallGrade: null, hasSnapshot: false, playCount: null }),
    work("r-3", { workDate: "2026-10-30", overallGrade: "良" }),
  ];

  const trend = buildMonthlyTrend(works, "2026-10-17");

  assert.deepEqual(
    trend.map((item) => item.month),
    ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
    "应补出近 6 个月（含本月）且按时间升序",
  );
  const empty = trend.find((item) => item.month === "2026-07");
  assert.ok(empty);
  assert.equal(empty.reportCount, 0);
  assert.equal(empty.avgPlay, null);
  assert.equal(empty.goodRate, null);
  assert.equal(empty.ratedCount, 0);

  const august = trend.find((item) => item.month === "2026-08");
  assert.ok(august);
  assert.equal(august.reportCount, 1);
  assert.equal(august.ratedCount, 1);
  assert.equal(august.goodRate, 1);

  const october = trend.find((item) => item.month === "2026-10");
  assert.ok(october);
  assert.equal(october.reportCount, 2, "10 月两件作品都按 workDate 计入本月");
  assert.equal(october.ratedCount, 1);
  assert.equal(october.goodRate, 1);
});

test("buildMonthSummary 良优率分母只计已评级作品，缺快照不进分母", () => {
  const works = [
    work("r-1", { overallGrade: "优" }),
    work("r-2", { overallGrade: "良" }),
    work("r-3", { overallGrade: "普" }),
    work("r-4", { overallGrade: null, hasSnapshot: false, playCount: null }),
  ];
  const rows = works.map((item) => row(item.reportId));

  const summary = buildMonthSummary(works, rows, new Map());

  assert.equal(summary.reportCount, 4);
  assert.equal(summary.ratedCount, 3, "未评级作品不进良优率分母");
  assert.ok(summary.goodRate != null);
  assert.ok(Math.abs(summary.goodRate - 2 / 3) < 1e-9, `良优率应为 2/3，实际 ${summary.goodRate}`);
  assert.equal(summary.snapshotCount, 0);
  assert.equal(summary.interactionRate, null, "无快照样本比率应为 null，而不是 0%");
});

test("buildMonthSummary 汇总指标先加总再相除（与 buildPerformanceMetrics 同源）", () => {
  const works = [work("r-1", { overallGrade: "优" }), work("r-2", { overallGrade: "良" })];
  const rows = works.map((item) => row(item.reportId));
  const snapshots = new Map<string, VideoSnapshotMetrics>([
    ["video-r-1", snapshot("video-r-1", 2000, 100, 20)],
    ["video-r-2", snapshot("video-r-2", 6000, 300, 60)],
  ]);

  const summary = buildMonthSummary(works, rows, snapshots);

  assert.equal(summary.snapshotCount, 2);
  assert.equal(summary.totalPlay, 8000);
  assert.equal(summary.avgPlay, 4000);
  assert.equal(summary.interactionRate, 400 / 8000);
  assert.equal(summary.followerConversionRate, 80 / 8000);
  assert.equal(summary.goodRate, 1);
});

test("buildStrengths 题材分组各组作品数之和等于总数，未标注组排最后", () => {
  const works = [
    work("r-1", { subject: "干货" }),
    work("r-2", { subject: "干货" }),
    work("r-3", { subject: "复盘" }),
    work("r-4", { subject: null }),
    work("r-5", { subject: "干货", overallGrade: "优" }),
    work("r-6", { subject: null }),
    work("r-7", { subject: null }),
    work("r-8", { subject: "复盘" }),
    work("r-9", { subject: "复盘" }),
    work("r-10", { subject: "复盘", hasSnapshot: false, playCount: null }),
    work("r-11", { subject: "干货" }),
    work("r-12", { subject: "干货" }),
  ];

  const strengths = buildStrengths(works);

  assert.equal(
    strengths.reduce((sum, item) => sum + item.reportCount, 0),
    works.length,
    "各组作品数之和必须等于作品总数",
  );
  assert.deepEqual(strengths.map((item) => item.subject), ["干货", "复盘", null]);
  assert.equal(strengths.at(-1)?.subject, null, "未标注组排最后");
  const dry = strengths.find((item) => item.subject === "干货");
  assert.ok(dry);
  assert.equal(dry.reportCount, 5);
  assert.equal(dry.ratedCount, 1);
  assert.equal(dry.goodRate, 1);
});

test("buildTopWorks 按 优>良>普>劣>null 排序，同级按播放与日期降序", () => {
  const works = [
    work("null-1", { overallGrade: null, workDate: "2026-10-05" }),
    work("poor-1", { overallGrade: "劣", workDate: "2026-10-04" }),
    work("fair-1", { overallGrade: "普", workDate: "2026-10-03" }),
    work("good-1", { overallGrade: "良", workDate: "2026-10-02" }),
    work("great-1", { overallGrade: "优", workDate: "2026-10-01" }),
    work("great-2", { overallGrade: "优", playCount: 9000, workDate: "2026-09-01" }),
    work("great-3", { overallGrade: "优", playCount: 9000, workDate: "2026-09-20" }),
    work("good-2", { overallGrade: "良", playCount: 500, workDate: "2026-10-06" }),
  ];

  assert.deepEqual(
    buildTopWorks(works, 5).map((item) => item.reportId),
    ["great-3", "great-2", "great-1", "good-1", "good-2"],
    "优在前、良次之；同级先按播放降序，播放相同按日期降序",
  );
  assert.deepEqual(
    buildTopWorks([...works].reverse()).map((item) => item.overallGrade),
    ["优", "优", "优", "良", "良"],
  );
  const tail = buildTopWorks(works, works.length).slice(-3).map((item) => item.overallGrade);
  assert.deepEqual(tail, ["普", "劣", null], "未评级排在所有评级之后");
});

test("buildRecentAnomalies 只留真异常并按作品日期降序", () => {
  const works = [
    work("r-1", { anomaly: "限流", workDate: "2026-10-01" }),
    work("r-2", { anomaly: "normal", workDate: "2026-10-02" }),
    work("r-3", { anomaly: null, workDate: "2026-10-03" }),
    work("r-4", { anomaly: "正常", workDate: "2026-10-04" }),
    work("r-5", { anomaly: "删稿", workDate: "2026-10-05" }),
  ];

  assert.deepEqual(
    buildRecentAnomalies(works).map((item) => item.reportId),
    ["r-5", "r-1"],
  );
});

test("derivePersonRoles 一人多岗按并集汇总", () => {
  const roles = derivePersonRoles([
    work("r-1", { roles: ["talent"] }),
    work("r-2", { roles: ["writer", "operator"] }),
    work("r-3", { roles: ["writer", "editor"] }),
  ]);

  assert.deepEqual(roles, { talent: true, writer: true, editor: true, operator: true });
  assert.deepEqual(derivePersonRoles([work("r-4", { roles: ["talent"] })]), {
    talent: true,
    writer: false,
    editor: false,
    operator: false,
  });
});
