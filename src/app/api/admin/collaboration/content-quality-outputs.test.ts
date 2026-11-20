import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentQualitySummaryFromWorks,
  buildWorkContentQualityFromMetrics,
} from "@/lib/content-quality";
import { buildPersonPayload } from "@/lib/collaboration/domain/person-rules";
import type {
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
} from "@/lib/collaboration/domain/types";
import { buildStaff } from "@/lib/collaboration/domain/role-metrics";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

/** 内容质量：小队汇总、文案行与个人档案三处出口（作品级计算见 content-quality.test.ts）。 */

function report(overrides: Partial<CollaborationReport> = {}): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: "owner-1",
    report_date: "2026-09-20",
    account_id: "account-1",
    video_id: overrides.video_id ?? "video-1",
    title: overrides.title ?? "作品",
    play_count: overrides.play_count ?? 10000,
    data_source: null,
    follower_convert: 0,
    script_author_user_id: overrides.script_author_user_id ?? "writer-1",
    video_editor_user_id: null,
    operator_user_id: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<VideoSnapshotMetrics> = {}): VideoSnapshotMetrics {
  return {
    videoId: "video-1",
    playCount: 10000,
    likes: 300,
    comments: 100,
    shares: 100,
    favorites: 200,
    followerGain: 0,
    avgPlayDuration: 50,
    avgPlayRatio: 0.25,
    bounceRate2s: 25,
    completionRate5s: 60,
    completionRate: 10,
    ...overrides,
  };
}

function topics(entries: Array<[string, string | null]>, state: "ready" | "error" = "ready"): ContentQualityTopicContext {
  return { state, tags: new Map(entries) };
}


const snapshotInputBase = {
  playCount: 15000,
  likes: 400,
  comments: 100,
  shares: 100,
  favorites: 200,
  avgPlayDuration: 50,
  avgPlayRatio: 0.25,
  bounceRate2s: 25,
  completionRate5s: 60,
  completionRate: 10,
};

test("小队汇总带五项留存原始值的作品算术平均，样本与留存达成一致（播放不足 2000 的不计入）", () => {
  const tags = new Map([["a", "复盘"], ["b", "复盘"], ["low", "复盘"]]);
  const works = [
    buildWorkContentQualityFromMetrics(
      { videoId: "a", snapshot: { ...snapshotInputBase, bounceRate2s: 20, completionRate5s: 60, avgPlayDuration: 40, avgPlayRatio: 0.2, completionRate: 10 } },
      { state: "ready", tags },
    ),
    buildWorkContentQualityFromMetrics(
      { videoId: "b", snapshot: { ...snapshotInputBase, bounceRate2s: 30, completionRate5s: 80, avgPlayDuration: 60, avgPlayRatio: 0.4, completionRate: 20 } },
      { state: "ready", tags },
    ),
    buildWorkContentQualityFromMetrics(
      { videoId: "low", snapshot: { ...snapshotInputBase, playCount: 1000, bounceRate2s: 90, completionRate5s: 5, avgPlayDuration: 2, avgPlayRatio: 0.01, completionRate: 1 } },
      { state: "ready", tags },
    ),
  ];
  const summary = buildContentQualitySummaryFromWorks(works);
  assert.equal(summary.achievementSampleCount, 2);
  assert.deepEqual(summary.retentionAverages, {
    bounceRate2s: 25,
    completionRate5s: 70,
    avgPlayDuration: 50,
    avgPlayRatio: 30,
    completionRate: 15,
  });
  assert.equal(buildContentQualitySummaryFromWorks([]).retentionAverages, null, "无样本时整体为空，不伪装成 0");
});

test("buildStaff 文案行显式返回真实质量汇总，剪辑行不新增文案块", () => {
  const rows = [report()];
  const profiles = [{ id: "writer-1", name: "文案", team_id: "team-1" }];
  const accounts = [{ id: "account-1", name: "账号", profile_id: "owner-1" }];
  const qualityTopics = topics([["video-1", "干货"]]);
  const snapshots = new Map([["video-1", snapshot()]]);
  const writer = buildStaff(rows, "writer", profiles, accounts, [], snapshots, qualityTopics)[0]!;
  assert.equal(writer.writerQuality?.state, "ready");
  assert.equal(writer.writerQuality?.summary?.totalCount, 1);
  assert.equal(writer.writerQuality?.summary?.achievementSampleCount, 1);

  const editor = buildStaff(rows, "editor", profiles, accounts, [], snapshots, qualityTopics);
  assert.equal(editor.length, 0);
});

test("个人 payload 同时补月度文案明细、近30日作品质量和规则，不混入其他岗位日报", () => {
  const currentWriter = report({ id: "current-writer", video_id: "video-1" });
  const currentEditor = report({ id: "current-editor", video_id: "video-2", video_editor_user_id: "writer-1", script_author_user_id: null });
  const payload = buildPersonPayload({
    targetUserId: "writer-1",
    year: 2026,
    month: 9,
    reports: [currentWriter, currentEditor],
    profile: { id: "writer-1", name: "文案", team_id: "team-1" },
    profiles: [{ id: "writer-1", name: "文案", team_id: "team-1" }],
    accounts: [{ id: "account-1", name: "账号", profile_id: "owner-1" }],
    videos: [],
    growthRole: "writers",
    growthReports: [currentWriter],
    growthSnapshots: new Map([["video-1", snapshot()]]),
    currentSnapshots: new Map([["video-1", snapshot()]]),
    qualityTopics: topics([["video-1", "干货"]]),
    today: "2026-09-30",
  });
  assert.equal(payload.writerQuality?.state, "ready");
  assert.deepEqual(payload.writerQuality?.monthWorks.map((work) => work.reportId), ["current-writer"]);
  assert.equal(payload.writerQuality?.monthSummary?.totalCount, 1);
  assert.equal(payload.growthWorks[0]?.contentQuality?.topicKind, "dry_goods");
});

test("达人个人作品明细使用同一份公司内容质量标准，不再计算转粉评级", () => {
  const standards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    targets: {
      reviewLikeRate: 10,
      dryFavoriteRate: 10,
      interactionRate: 20,
      followerRate: 2,
    },
  };
  const talentRow = report({ id: "configured-talent", video_id: "configured-video" });
  const configuredSnapshot = snapshot({
    videoId: "configured-video",
    playCount: 15000,
    likes: 450,
    comments: 0,
    shares: 0,
    favorites: 600,
    followerGain: 150,
  });
  const payload = buildPersonPayload({
    targetUserId: "owner-1",
    year: 2026,
    month: 9,
    reports: [talentRow],
    profile: { id: "owner-1", name: "达人", team_id: "team-1" },
    profiles: [{ id: "owner-1", name: "达人", team_id: "team-1" }],
    accounts: [{ id: "account-1", name: "账号", profile_id: "owner-1" }],
    videos: [],
    growthRole: "talents",
    growthReports: [],
    growthSnapshots: new Map(),
    currentSnapshots: new Map([["configured-video", configuredSnapshot]]),
    recordRows: [talentRow],
    qualityTopics: topics([["configured-video", "干货"]]),
    evaluationStandards: standards,
    today: "2026-09-30",
  });

  assert.equal(payload.records[0]?.contentQuality?.topicKind, "dry_goods");
  assert.equal(payload.records[0]?.contentQuality?.interactionAchievement, 35);
  assert.equal(payload.records[0]?.contentQuality?.contentAchievement, 100);
  assert.equal("followerAchievement" in payload.records[0]!, false);
});
