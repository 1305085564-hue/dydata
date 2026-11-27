import assert from "node:assert/strict";
import test from "node:test";

import { buildStaff } from "./role-metrics";
import { buildPersonWriterQuality } from "./quality-rules";
import type {
  CollaborationAccount,
  CollaborationProfile,
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
} from "./types";

const WRITER_ID = "writer-1";
const ACCOUNT_ID = "account-1";

function excellentSnapshot(videoId: string): VideoSnapshotMetrics {
  return {
    videoId,
    playCount: 20000,
    likes: 700,
    comments: 100,
    shares: 100,
    favorites: 200,
    followerGain: 80,
    avgPlayDuration: 55,
    avgPlayRatio: 0.3,
    bounceRate2s: 20,
    completionRate5s: 65,
    completionRate: 14,
  };
}

function makeReport(overrides: Partial<CollaborationReport>): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: WRITER_ID,
    report_date: "2026-11-20",
    published_at: "2026-11-20T10:00:00+08:00",
    account_id: ACCOUNT_ID,
    video_id: overrides.video_id ?? "video-1",
    title: overrides.title ?? "爆款作品",
    play_count: 20000,
    data_source: "ai",
    follower_convert: 10,
    script_author_user_id: WRITER_ID,
    video_editor_user_id: null,
    operator_user_id: null,
    settlement_excluded: false,
    settlement_excluded_reason: null,
    ...overrides,
  };
}

const profiles: CollaborationProfile[] = [{ id: WRITER_ID, name: "文案甲", team_id: "team-1" }];
const accounts: CollaborationAccount[] = [{ id: ACCOUNT_ID, name: "主号", profile_id: WRITER_ID }];
const topics: ContentQualityTopicContext = {
  state: "ready",
  tags: new Map([
    ["video-1", "干货"],
    ["video-2", "复盘"],
  ]),
};
const snapshots = new Map<string, VideoSnapshotMetrics>([
  ["video-1", excellentSnapshot("video-1")],
  ["video-2", excellentSnapshot("video-2")],
]);

test("标为无效（不计优结算）从文案优条数单一真源自动剔除，但保留原始作品数据可追溯；打回恢复后对称计回", () => {
  const excludedRows: CollaborationReport[] = [
    makeReport({ id: "r1", video_id: "video-1", title: "正常爆款", settlement_excluded: false }),
    makeReport({
      id: "r2",
      video_id: "video-2",
      title: "超期无效作品",
      settlement_excluded: true,
      settlement_excluded_reason: "超过 72 小时且无法核实真实发布时间",
    }),
  ];

  const [staffRow] = buildStaff(
    excludedRows,
    "writer",
    profiles,
    accounts,
    [{ userId: WRITER_ID, certified: true, certifiedByName: "负责人" }],
    snapshots,
    topics,
  );
  assert.equal(staffRow.reportCount, 2, "原始作品数量保留不丢数据");
  assert.equal(staffRow.writerQuality?.summary?.settlementEligibleExcellentCount, 1, "文案优条数自动剔除无效作品");
  assert.equal(staffRow.writerQuality?.summary?.excludedExcellentCount, 1);
  assert.equal(staffRow.writerQuality?.summary?.overallGradeCounts.excellent, 2);
  assert.equal(staffRow.writerQuality?.summary?.goodExcellentRate, 1);

  const personQuality = buildPersonWriterQuality({
    targetUserId: WRITER_ID,
    role: "writers",
    currentRows: excludedRows,
    growthRows: excludedRows,
    accounts,
    snapshots,
    topics,
  });
  const invalidWork = personQuality.monthWorks.find((w) => w.videoId === "video-2");
  assert.equal(invalidWork?.contentQuality?.overallGrade, "优", "原始评级留痕可追溯");
  assert.equal(invalidWork?.contentQuality?.settlementExcluded, true);
  assert.equal(invalidWork?.contentQuality?.settlementExcludedReason, "超过 72 小时且无法核实真实发布时间");
  assert.equal(personQuality.monthSummary?.settlementEligibleExcellentCount, 1);

  // 模拟管理员「打回待处理」后 settlement_excluded 对称恢复为 false
  const reopenedRows = excludedRows.map((row) => ({
    ...row,
    settlement_excluded: false,
    settlement_excluded_reason: null,
  }));
  const [restoredStaffRow] = buildStaff(
    reopenedRows,
    "writer",
    profiles,
    accounts,
    [{ userId: WRITER_ID, certified: true, certifiedByName: "负责人" }],
    snapshots,
    topics,
  );
  assert.equal(restoredStaffRow.writerQuality?.summary?.settlementEligibleExcellentCount, 2, "打回恢复后优条数对称恢复");
  assert.equal(restoredStaffRow.writerQuality?.summary?.excludedExcellentCount, undefined);
});
