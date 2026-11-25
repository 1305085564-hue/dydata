import type {
  WorkGroupPerformanceMetrics,
  WorkGroupViews,
  WorkGroupSummaryRow,
  WorkGroupDetailView,
  WorkGroupMemberRow,
  WorkGroupAggregate,
} from "@/lib/collaboration/domain/types";
import type {
  WorkContentQuality,
  ContentQualitySummary,
  PersonWriterQuality,
} from "@/lib/collaboration/content-quality-contract";

export interface SummaryData {
  total: number;
  attributed: number;
  unattributed: number;
}

export interface CollaborationOverviewStats {
  month: number;
  total: number;
  totalPlay: number;
  goodExcellentRate: number | null;
  restrictToSelf?: boolean;
}

export interface OperatorAccount {
  accountId: string;
  accountName: string;
  ownerName: string;
  reportCount: number;
  totalPlay: number;
  totalFollowerConvert: number;
}

export interface OperatorRow {
  followerConversionRate: number | null;
  interactionRate: number | null;
  /** 互动率拆项（与互动率同口径，四项相加等于互动率）；旧数据缺省为 undefined。 */
  likeRate?: number | null;
  commentRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
  userId: string;
  name: string;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  accountCount: number;
  operatedProfileCount: number;
  accounts: OperatorAccount[];
}

export interface StaffAccount {
  accountId: string;
  accountName: string;
}

export interface StaffRow {
  followerConversionRate: number | null;
  interactionRate: number | null;
  /** 互动率拆项（与互动率同口径，四项相加等于互动率）；旧数据缺省为 undefined。 */
  likeRate?: number | null;
  commentRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
  certifiedByName: string | null;
  isCertified?: boolean;
  userId: string;
  name: string;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  involvedAccounts: StaffAccount[];
  involvedAccountTotal: number;
  recentWorks: Array<{
    reportId: string;
    reportDate: string;
    title: string;
    accountName: string;
    playCount: number | null;
    dataSource?: "ai" | "manual" | null;
  }>;
  works: Array<{
    reportId: string;
    reportDate: string;
    title: string;
    accountName: string;
    playCount: number | null;
    dataSource?: "ai" | "manual" | null;
  }>;
  writerQuality?: {
    state: "ready" | "error";
    summary: ContentQualitySummary | null;
  } | null;
}

export type WriterCandidateRow = {
  userId: string;
  name: string;
  certified: boolean;
  writerQuality?: {
    state: "ready" | "error";
    summary: ContentQualitySummary | null;
  } | null;
};

export interface PersonCurrentMonth {
  writerCount: number;
  editorCount: number;
  operatorCount: number;
}

export interface PersonOperatorSummary {
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  accountCount: number;
  operatedProfileCount: number;
}

export type CollaborationRoleTab = "talents" | "operators" | "writers" | "editors";

export interface PersonGrowthWorkItem {
  reportId: string;
  videoId: string | null;
  title: string;
  accountName: string;
  reportDate: string;
  playCount: number;
  roles: Array<"writer" | "editor" | "operator">;
  hasSnapshot: boolean;
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
  contentQuality?: WorkContentQuality | null;
}

/**
 * 行情带均值：与岗位榜单、小队详情同源（先加总分子分母再相除），
 * 不是单条比率的算术平均；未同步 24h 快照的作品只计入作品数。
 */
export type PersonGrowthSummary = WorkGroupPerformanceMetrics;

export interface PersonRecordItem {
  dataSource?: "ai" | "manual" | null;
  reportId: string;
  reportDate: string;
  accountId: string;
  accountName: string;
  title: string;
  playCount: number;
  roles: Array<"writer" | "editor" | "operator">;
  anomaly: string | null;
  hasSnapshot: boolean;
  contentQuality?: WorkContentQuality | null;
}

export interface PersonDetailData {
  userId: string;
  name: string;
  teamId: string | null;
  currentMonth: PersonCurrentMonth;
  operatorSummary: PersonOperatorSummary | null;
  growthWorks: PersonGrowthWorkItem[];
  growthSummary: PersonGrowthSummary | null;
  records: PersonRecordItem[];
  writerQuality?: PersonWriterQuality | null;
  /** 达人岗位专属质量数据；作品按账号主人归属，结构与文案质量数据一致。 */
  talentQuality?: PersonWriterQuality | null;
}

export interface TalentAccount {
  accountId: string;
  accountName: string;
  reportCount: number;
  totalPlay: number;
  totalFollowerConvert: number;
}

export interface TalentRow {
  followerConversionRate: number | null;
  interactionRate: number | null;
  /** 互动率拆项（与互动率同口径，四项相加等于互动率）；旧数据缺省为 undefined。 */
  likeRate?: number | null;
  commentRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
  userId: string;
  name: string;
  accountCount: number;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  accounts: TalentAccount[];
  qualitySummary?: import("@/lib/collaboration/content-quality-contract").ContentQualitySummary | null;
  writerQuality?: StaffRow["writerQuality"];
}

export function formatBigNumber(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (val >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return val.toLocaleString("zh-CN");
}

export type {
  WorkGroupViews,
  WorkGroupSummaryRow,
  WorkGroupDetailView,
  WorkGroupMemberRow,
  WorkGroupAggregate,
  WorkGroupPerformanceMetrics,
} from "@/lib/collaboration/domain/types";

export type {
  WorkGroupRow,
  WorkGroupKind,
  WorkGroupRosterMember,
} from "@/lib/work-groups";

export type {
  TopicQualityTargets,
  ContentQualityRules,
  ContentQualityStatus,
  WorkContentQuality,
  ContentQualitySummary,
  PersonWriterWorkItem,
  WriterQualityState,
  PersonWriterQuality,
} from "@/lib/collaboration/content-quality-contract";
