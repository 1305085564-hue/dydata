export {
  STATS_START_DATE,
  CollaborationNotFoundError,
} from "@/lib/collaboration/domain/types";
export type {
  WriterEligibility,
  CollaborationRole,
  CollaborationRoleTab,
  CollaborationReport,
  CollaborationProfile,
  CollaborationAccount,
  CollaborationVideo,
  MonthRange,
  AttributionPayload,
  AttributionReport,
  PersonGrowthInput,
  CollaborationMonthDataset,
  VideoSnapshotMetrics,
  ContentQualityTopicContext,
  PersonGrowthWorkItem,
  TalentAccount,
  TalentRow,
  WorkGroupPerformanceMetrics,
  WorkGroupMemberRow,
  WorkGroupAggregate,
  WorkGroupSummaryRow,
  WorkGroupDetailView,
  WorkGroupViews,
} from "@/lib/collaboration/domain/types";

export {
  selectGrowthReports,
  getMonthRange,
  getPreviousMonthRange,
  getSixMonthRanges,
  parseMonthParams,
  buildSummary,
  buildUnattributedReports,
  buildPerformanceMetrics,
} from "@/lib/collaboration/domain/report-rules";

export {
  buildOperators,
  buildStaff,
} from "@/lib/collaboration/domain/role-metrics";
export type {
  StaffRow,
  OperatorRow,
} from "@/lib/collaboration/domain/role-metrics";

export {
  buildPersonGrowthWorks,
  buildPersonGrowth,
  buildPersonPayload,
} from "@/lib/collaboration/domain/person-rules";
export {
  contentQualityRules,
  buildWorkContentQuality,
  buildContentQualitySummary,
} from "@/lib/collaboration/domain/quality-rules";
export {
  buildCollaborationPageData,
  buildTalents,
} from "@/lib/collaboration/domain/aggregates";
export { buildWorkGroupViews } from "@/lib/collaboration/domain/work-group-rules";

export {
  queryScopedReports,
} from "@/lib/collaboration/data/reports";
export { loadCollaborationMonthDataset } from "@/lib/collaboration/data/dataset";
export { loadPersonData } from "@/lib/collaboration/data/person-loader";
export {
  parseAttributionPayload,
  loadAttributionReport,
  assertProfilesExist,
  updateAttributionAtomically,
} from "@/lib/collaboration/data/attribution";
