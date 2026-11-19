import type { WorkGroupDirectory, WorkGroupRosterMember } from "@/lib/work-groups";
import {
  STATS_START_DATE,
  type CollaborationAccount,
  type CollaborationProfile,
  type CollaborationMonthDataset,
  type CollaborationReport,
  type VideoSnapshotMetrics,
} from "@/lib/collaboration/domain/types";

/** 小队视图测试共用的一份月度数据：两支小队、兼岗成员、部分作品已同步快照。 */

export const TEAM = "team-1";
export const MONTH = { year: 2026, month: 9, start: "2026-09-01", end: "2026-09-30" };

export const profiles: CollaborationProfile[] = [
  { id: "writer-1", name: "张文案", team_id: TEAM, work_peer_group_id: "wg-writer", work_operator_group_id: null },
  { id: "writer-2", name: "李文案", team_id: TEAM, work_peer_group_id: "wg-writer", work_operator_group_id: null },
  { id: "owner-1", name: "达人甲", team_id: TEAM, work_peer_group_id: "wg-talent", work_operator_group_id: null },
  { id: "owner-2", name: "达人乙", team_id: TEAM, work_peer_group_id: "wg-talent", work_operator_group_id: null },
  { id: "operator-1", name: "王运营", team_id: TEAM, work_peer_group_id: "wg-writer", work_operator_group_id: "wg-operator" },
  { id: "operator-2", name: "赵运营", team_id: TEAM, work_peer_group_id: null, work_operator_group_id: "wg-operator" },
];

export const accounts: CollaborationAccount[] = [
  { id: "account-1", name: "账号A", profile_id: "owner-1" },
  { id: "account-2", name: "账号B", profile_id: "owner-2" },
  { id: "account-free", name: "悬空账号", profile_id: null },
];

export const roster: WorkGroupRosterMember[] = [
  { id: "writer-1", name: "张文案", teamId: TEAM, peerGroupId: "wg-writer", operatorGroupId: null },
  { id: "writer-2", name: "李文案", teamId: TEAM, peerGroupId: "wg-writer", operatorGroupId: null },
  { id: "owner-1", name: "达人甲", teamId: TEAM, peerGroupId: "wg-talent", operatorGroupId: null },
  { id: "owner-2", name: "达人乙", teamId: TEAM, peerGroupId: "wg-talent", operatorGroupId: null },
  // 兼岗：文案组 + 运营组各算各的人（岗位人数不跨岗位去重）
  { id: "operator-1", name: "王运营", teamId: TEAM, peerGroupId: "wg-writer", operatorGroupId: "wg-operator" },
  { id: "operator-2", name: "赵运营", teamId: TEAM, peerGroupId: null, operatorGroupId: "wg-operator" },
];

export const directory: WorkGroupDirectory = {
  ready: true,
  groups: [
    { id: "wg-writer", teamId: TEAM, name: "文案一组", kind: "writer", createdAt: STATS_START_DATE, createdBy: "user-owner" },
    { id: "wg-writer-empty", teamId: TEAM, name: "文案二组", kind: "writer", createdAt: STATS_START_DATE, createdBy: "user-owner" },
    { id: "wg-talent", teamId: TEAM, name: "达人一组", kind: "talent", createdAt: STATS_START_DATE, createdBy: "user-owner" },
    { id: "wg-operator", teamId: TEAM, name: "运营组", kind: "operator", createdAt: STATS_START_DATE, createdBy: "user-owner" },
  ],
  roster,
};

export function report(overrides: Partial<CollaborationReport> = {}): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: overrides.user_id ?? "owner-1",
    report_date: overrides.report_date ?? "2026-09-02",
    account_id: overrides.account_id ?? "account-1",
    video_id: overrides.video_id ?? null,
    title: overrides.title ?? "视频标题",
    play_count: overrides.play_count ?? 100,
    follower_convert: overrides.follower_convert ?? 0,
    data_source: overrides.data_source ?? null,
    script_author_user_id: overrides.script_author_user_id ?? null,
    video_editor_user_id: overrides.video_editor_user_id ?? null,
    operator_user_id: overrides.operator_user_id ?? null,
  };
}

export const currentRows: CollaborationReport[] = [
  // 文案 writer-1：三篇署名——v-1 已同步、w-own 发在达人账号上（文案含本人/他人账号都计）、v-3 只有 72h 快照（不同步）
  report({ id: "w-1", account_id: "account-free", video_id: "v-1", report_date: "2026-09-02", play_count: 1000, script_author_user_id: "writer-1" }),
  report({ id: "w-own", account_id: "account-1", video_id: "v-2", report_date: "2026-09-03", play_count: 50000, script_author_user_id: "writer-1" }),
  report({ id: "w-3", account_id: "account-free", video_id: "v-3", report_date: "2026-09-04", play_count: 8000, script_author_user_id: "writer-1" }),
  // 达人 owner-1：账号 account-1 两条——w-own 已同步、t-2 没绑视频
  report({ id: "t-2", account_id: "account-1", video_id: null, report_date: "2026-09-05", play_count: 3000, user_id: "owner-1" }),
  // 运营 operator-1：给悬空账号做的一条（v-4）
  report({ id: "o-1", account_id: "account-free", video_id: "v-4", report_date: "2026-09-06", play_count: 2000, operator_user_id: "operator-1" }),
];

/** 手造的「每视频最新 24h 快照」映射（loader 测试另用原始快照行走真实去重路径）。 */
// gate:transient-map 测试固定数据，不是缓存
export const snapshots = new Map<string, VideoSnapshotMetrics>([
  { videoId: "v-1", playCount: 10000, likes: 500, comments: 100, shares: 50, favorites: 250, followerGain: 200, avgPlayDuration: 40, avgPlayRatio: 0.25, bounceRate2s: 25, completionRate5s: 60, completionRate: 10 },
  { videoId: "v-2", playCount: 50000, likes: 1000, comments: 200, shares: 100, favorites: 500, followerGain: 500, avgPlayDuration: 40, avgPlayRatio: 0.25, bounceRate2s: 25, completionRate5s: 60, completionRate: 10 },
  { videoId: "v-4", playCount: 20000, likes: 400, comments: 80, shares: 40, favorites: 200, followerGain: 100, avgPlayDuration: 40, avgPlayRatio: 0.25, bounceRate2s: 25, completionRate5s: 60, completionRate: 10 },
].map((row) => [row.videoId, row]));

export const dataset: CollaborationMonthDataset = {
  currentRows,
  profiles,
  accounts,
  visibleUserIds: profiles.map((profile) => profile.id),
  workGroups: directory,
  videoSnapshots: snapshots,
};
