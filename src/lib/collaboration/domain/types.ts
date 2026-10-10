import type { WorkGroupDirectory, WorkGroupKind } from "@/lib/work-groups";
import type {
  ContentQualitySummary,
  WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";

export type WriterEligibility = { userId: string; certified: boolean; certifiedByName: string | null };

export const STATS_START_DATE = "2026-07-27";

export type CollaborationRole = "writer" | "editor" | "operator";
export type CollaborationRoleTab = "talents" | "operators" | "writers" | "editors";

export type CollaborationReport = {
  id: string;
  user_id: string;
  report_date: string;
  /** 视频在平台的真实发布时间；作品展示日期优先使用它。 */
  published_at?: string | null;
  account_id: string;
  video_id: string | null;
  title: string;
  play_count: number | null;
  data_source?: "ai" | "manual" | null;
  follower_convert: number | null;
  script_author_user_id: string | null;
  video_editor_user_id: string | null;
  operator_user_id: string | null;
};

export type CollaborationProfile = {
  id: string;
  name: string | null;
  team_id: string | null;
  /** 工种小队归属（文案/达人二选一，运营可兼任）；与 `work_groups` 同源，仅用于展示分组，不参与权限。 */
  work_peer_group_id?: string | null;
  work_operator_group_id?: string | null;
};

export type CollaborationAccount = {
  id: string;
  name: string | null;
  profile_id: string | null;
};

export type CollaborationVideo = {
  id: string;
  account_id: string;
  video_title: string | null;
  published_at: string | null;
  uploaded_at: string | null;
  anomaly_status: string | null;
};

export type MonthRange = {
  year: number;
  month: number;
  start: string;
  end: string;
};

export type AttributionPayload = {
  reportId: string;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
};

export type AttributionReport = Pick<CollaborationReport, "id" | "user_id" | "account_id" | "report_date">;

export type PersonGrowthInput = {
  targetUserId: string;
  role: CollaborationRoleTab;
  reports: CollaborationReport[];
  accounts: CollaborationAccount[];
  snapshots: Map<string, VideoSnapshotMetrics>;
  today: string;
  qualityTopics?: ContentQualityTopicContext;
};

export type CollaborationMonthDataset = {
  currentRows: CollaborationReport[];
  previousRows: CollaborationReport[];
  historyRows?: CollaborationReport[];
  writerCertifications?: WriterEligibility[];
  profiles: CollaborationProfile[];
  accounts: CollaborationAccount[];
  /** 可见范围（带入 resolveCollaborationScope 解析结果）：组详情只出范围成员；组员在数据管理可读本公司。 */
  visibleUserIds?: string[];
  /** 工种小队目录；只在需要「按团队」时加载，恒定两次查询，不随小队数量增长。 */
  workGroups?: WorkGroupDirectory;
  /** 每视频最新 24h 快照的绩效字段；岗位与按团队共用同一最新快照聚合。 */
  videoSnapshots?: Map<string, VideoSnapshotMetrics>;
  videoTopicTags?: ContentQualityTopicContext;
};

/** 视频复盘 24h 快照的绩效字段（与内容复盘抽屉同源）。 */
export type VideoSnapshotMetrics = {
  videoId: string;
  playCount: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  followerGain: number | null;
};

export type ContentQualityTopicContext = {
  state: "ready" | "error";
  tags: Map<string, string | null>;
};

export type PersonGrowthWorkItem = {
  reportId: string;
  videoId: string | null;
  title: string;
  accountName: string;
  reportDate: string;
  playCount: number;
  roles: CollaborationRole[];
  hasSnapshot: boolean;
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
  contentQuality?: WorkContentQuality | null;
};

export type TalentAccount = {
  accountId: string;
  accountName: string;
  reportCount: number;
  totalPlay: number;
  totalFollowerConvert: number;
};

export type TalentRow = {
  followerConversionRate: number | null;
  interactionRate: number | null;
  effectiveCount: number;
  excellentCount: number;
  userId: string;
  name: string;
  accountCount: number;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  hitCount: number;
  selfHandledCount: number;
  accounts: TalentAccount[];
};

/**
 * 「按团队」绩效指标：与视频复盘抽屉同源（每作品取最新 24h 快照），先加总再相除。
 * - reportCount = 当月署名作品数（全部，含未同步视频复盘的作品，与按岗位口径一致）
 * - snapshotCount = 其中取到 24h 快照的作品数
 * - totalPlay = 快照播放合计；avgPlay = floor(totalPlay / snapshotCount)，不用未同步作品稀释
 * - 各比率 = 作品分子合计 ÷ 播放合计（加权口径，不是逐条比率再平均）；播放合计为 0 时为 null
 */
export type WorkGroupPerformanceMetrics = {
  reportCount: number;
  snapshotCount: number;
  totalPlay: number;
  avgPlay: number;
  followerConversionRate: number | null;
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
};

/** 组员行 = 编制名单成员 + 当月绩效指标；零产出组员照常出行（数值 0、比率 —）。 */
export type WorkGroupMemberRow = {
  userId: string;
  name: string;
  /** 仅文案小队计算作品级内容质量；达人/运营保持 null。 */
  contentQuality: ContentQualitySummary | null;
} & WorkGroupPerformanceMetrics;

/** 组综合 = 组内全部署名作品一次聚合（比率按合计重算，不是成员比率的平均）。 */
export type WorkGroupAggregate = WorkGroupPerformanceMetrics;

export type WorkGroupSummaryRow = {
  id: string;
  name: string;
  kind: WorkGroupKind;
  teamId: string;
  /** 可见范围内的小队人数：与 `members` 行数严格相等，不出现「人数 5 / 只出 2 行」。 */
  memberCount: number;
  aggregate: WorkGroupAggregate;
  /** 仅文案小队计算作品级内容质量；达人/运营保持 null。 */
  contentQuality: ContentQualitySummary | null;
};

export type WorkGroupDetailView = {
  summary: WorkGroupSummaryRow;
  /** 先按小队当前编制名单出全员行（零产出、文案未认证也出行），再叠加统计。 */
  members: WorkGroupMemberRow[];
};

export type WorkGroupViews = {
  /** false = 库还没跑 work_groups migration，按团队模式应显示「尚未上线」而不是空列表。 */
  ready: boolean;
  groups: WorkGroupSummaryRow[];
  details: WorkGroupDetailView[];
};

export class CollaborationNotFoundError extends Error {}
