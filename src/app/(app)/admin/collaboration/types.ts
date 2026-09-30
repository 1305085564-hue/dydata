import type { WorkGroupPerformanceMetrics } from "@/app/api/admin/collaboration/_shared";
import type {
  WorkContentQuality,
  ContentQualitySummary,
  PersonWriterQuality,
} from "@/lib/collaboration/content-quality-contract";

export interface SummaryData {
  total: number;
  attributed: number;
  selfHandled: number;
  unattributed: number;
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
  effectiveCount: number;
  excellentCount: number;
  userId: string;
  name: string;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  hitCount: number;
  momChange: number | null;
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
  billingCount: number | null;
  certifiedByName: string | null;
  isCertified?: boolean;
  effectiveCount: number;
  excellentCount: number;
  userId: string;
  name: string;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  selfHandledCount: number;
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
  hitCount: number;
  momChange: number | null;
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
}

export function formatBigNumber(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (val >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return val.toLocaleString("zh-CN");
}

/**
 * 环比展示：涨幅达到 1000%（10 倍）时改用倍数。
 * 「+2462.6%」这类四位数增幅出现在管理看板上，第一反应是数据出错；
 * 「+24.6 倍」量级一眼可读，信息也不丢（跌幅不可能超过 -100%，无需处理）。
 */
export function formatMomChange(mom: number): string {
  return mom >= 10 ? `${mom.toFixed(1)} 倍` : `${(mom * 100).toFixed(1)}%`;
}

export type {
  WorkGroupViews,
  WorkGroupSummaryRow,
  WorkGroupDetailView,
  WorkGroupMemberRow,
  WorkGroupAggregate,
  WorkGroupPerformanceMetrics,
} from "@/app/api/admin/collaboration/_shared";

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

