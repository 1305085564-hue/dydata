import type { DailyReportDataSource } from "@/lib/daily-report-data-source";
import type { HistoryDataCapability } from "@/lib/history-data-capability";
import type { EditDetailAssigneeProfile } from "./assignee-profiles";

// 编辑回填详情的数据结构：接口负责组装，填报表单负责消费，定义只在这里一处。

export interface VideoSubmissionEditDetail {
  /** 历史数据能力分层；缺失时兼容旧调用方夹具。 */
  historyCapability?: HistoryDataCapability;
  videoId: string;
  accountId: string;
  bizDate: string;
  dataSource: DailyReportDataSource;
  meta: {
    videoUrl: string | null;
    videoTitle: string | null;
    content: string;
    publishedAt: string | null;
    publishedAtText: string | null;
    anomalyStatus: "normal" | "abnormal";
    punishType: string | null;
    platformNotice: string | null;
    appeal: string | null;
    topicTag: string | null;
    videoForm: string | null;
    contentKeywords: string[];
    scriptAuthorUserId: string | null;
    videoEditorUserId: string | null;
    operatorUserId: string | null;
  };
  metrics: {
    playCount: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    followerGain: number;
    followerLoss: number;
    /** 选填指标：留空即落库为 null（写入侧见 `指标分组区.tsx` 的 optional）。 */
    followerConvert: number | null;
    avgPlayDuration: number | null;
    avgPlayRatio?: number | null;
    bounceRate2s: number | null;
    completionRate5s: number | null;
    completionRate: number | null;
  };
  assets: Array<{
    role: "screenshot_1" | "screenshot_2";
    url: string;
    confirmed: boolean;
    confidenceScore: number | null;
    recognizedFields: Record<string, unknown> | null;
    screenshotType: "data" | "curve" | "retention" | null;
  }>;
  assigneeProfiles?: Array<{
    userId: string;
    name: string | null;
    displayName: string | null;
    membershipStatus: string | null;
  }>;
  uploadedAt: string | null;
}

export interface UnboundDailyReportDetail {
  /** 无绑定视频仍是可编辑的日报记录，但只允许写日报字段。 */
  historyCapability?: HistoryDataCapability;
  reportId: string;
  videoId: null;
  accountId: string;
  bizDate: string;
  dataSource: DailyReportDataSource;
  meta: {
    videoUrl: null;
    videoTitle: string;
    content: string;
    publishedAt: string | null;
    publishedAtText: null;
    anomalyStatus: "normal";
    punishType: null;
    platformNotice: null;
    appeal: null;
    topicTag: null;
    videoForm: null;
    contentKeywords: string[];
    scriptAuthorUserId: string | null;
    videoEditorUserId: string | null;
    operatorUserId: string | null;
  };
  metrics: {
    playCount: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    followerGain: number | null;
    followerLoss: null;
    followerConvert: number | null;
    avgPlayDuration: number | null;
    avgPlayRatio: null;
    bounceRate2s: number | null;
    completionRate5s: number | null;
    completionRate: number | null;
  };
  assets: [];
  uploadedAt: string | null;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
  assigneeProfiles: EditDetailAssigneeProfile[];
}
