export type UserRole = "member" | "admin" | "owner";
export type UserStatus = "active" | "exempt";
export type ExemptType = "permanent" | "temporary";
export type LeaderboardRange = "today" | "week" | "month";
export type LeaderboardType = "overall" | "tag" | "progress";

export const PERMISSION_KEYS = [
  "view_all_data",
  "edit_data",
  "export_data",
  "manage_invite",
  "view_analytics",
  "view_audit_log",
  "manage_members",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type Permissions = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_all_data: "查看所有数据",
  edit_data: "编辑/删除数据",
  export_data: "导出数据",
  manage_invite: "管理邀请码",
  view_analytics: "数据分析",
  view_audit_log: "查看操作日志",
  manage_members: "管理成员状态",
};

export const DEFAULT_ADMIN_PERMISSIONS: Permissions = {
  view_all_data: true,
  edit_data: false,
  export_data: true,
  manage_invite: false,
  view_analytics: true,
  view_audit_log: false,
  manage_members: false,
};

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  exempt_type: ExemptType | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  permissions: Permissions;
  team_id?: string | null;
  group_id?: string | null;
  created_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  created_by: string | null;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  title: string;
  submitter: string;
  play_count: number;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string;
  created_at: string;
}

export interface AccountLeaderboardRow {
  account_id: string;
  account_name: string;
  profile_id: string;
  owner_name: string;
  content_direction: string | null;
  presentation_format: string | null;
  report_date: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
}

export interface AccountLeaderboardItem {
  accountId: string;
  accountName: string;
  ownerName: string;
  contentDirection: string | null;
  presentationFormat: string | null;
  isOwn: boolean;
  rank: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  followerGain: number;
  followerConvert: number;
  watchDuration: number | null;
  bounceRate: number | null;
  completionRate5s: number | null;
  progressRate: number | null;
  isBreakout: boolean;
}

// === 阶段 1.5 新增类型 ===

export type AnomalyStatus = "正常" | "删稿" | "限流" | "投流" | "活动干预" | "未满24h";
export type SnapshotType = "24h" | "72h";
export type SubmissionAssetRole = "screenshot_1" | "screenshot_2" | "screenshot_3";
export type SubmissionFieldSource = "ocr" | "manual";
export type TagDimension = "题材" | "表达形式" | "CTA类型" | "内容结构" | "目标受众" | "话题" | "关键词";
export type VideoTagReviewDimension = "题材" | "表达形式" | "CTA类型";
export type TagSource = "ai" | "manual";
export type MarketSentiment = "强" | "中" | "弱";
export type AdviceSource = "ai" | "manager";
export type AdviceStatus = "待查看" | "已查看" | "待执行" | "已执行" | "已忽略" | "已复核";
export type ReviewResult = "有效" | "无效" | "不确定";
export type AccountTargetMode = "起号" | "稳号" | "导粉";

export const TAG_ENUMS: Record<TagDimension, string[]> = {
  "题材": ["大盘复盘", "板块机会", "个股拆解", "情绪周期", "战法教学", "风险提醒", "热点追踪", "盘前预判"],
  "表达形式": ["结论先行", "问答式", "清单式", "案例拆解", "情绪点评", "故事引入", "观点输出"],
  "CTA类型": ["关注", "评论", "私信", "看主页", "进群", "无明显CTA"],
  "内容结构": ["先结论后逻辑", "先冲突后解释", "三段式", "总分总", "盘面现象→原因→操作", "错误案例→正确做法"],
  "目标受众": ["新手股民", "短线交易者", "老股民", "上班族投资者", "追热点用户"],
  "话题": ["干货", "复盘"],
  "关键词": [],
};

export const VIDEO_TAG_REVIEW_DIMENSIONS: VideoTagReviewDimension[] = ["题材", "表达形式", "CTA类型"];

export interface Video {
  id: string;
  account_id: string;
  user_id: string;
  video_url: string | null;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string;
  anomaly_status: AnomalyStatus;
  created_at: string;
}

export interface VideoMetricsSnapshot {
  id: string;
  video_id: string;
  snapshot_type: SnapshotType;
  play_count: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_loss: number;
  fan_play_ratio: number | null;
  homepage_visits: number;
  follower_convert: number;
  cover_click_rate: number | null;
  avg_play_duration: number | null;
  completion_rate: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  avg_play_ratio: number | null;
  vs_previous: Record<string, unknown> | null;
  screenshot_urls: string[] | null;
  curve_screenshot_url: string | null;
  retention_screenshot_url: string | null;
  captured_at: string;
}

export interface SubmissionAssetMeta {
  role: SubmissionAssetRole;
  url: string;
  confirmed: boolean;
  confidence_score: number | null;
  recognized_fields?: Record<string, unknown> | null;
  screenshot_type?: "data" | "curve" | "retention" | null;
}

export interface VideoTag {
  id: string;
  video_id: string;
  tag_dimension: TagDimension;
  tag_value: string;
  source: TagSource;
  confidence: number | null;
  reason: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface MarketContextDaily {
  id: string;
  context_date: string;
  is_trading_day: boolean;
  market_change: Record<string, number> | null;
  market_sentiment: MarketSentiment | null;
  hot_sectors: string[] | null;
  source: string;
  updated_by: string | null;
  created_at: string;
}

export interface AdviceAction {
  id: string;
  target_user_id: string;
  target_account_id: string | null;
  advice_content: string;
  evidence: string | null;
  advice_source: AdviceSource;
  status: AdviceStatus;
  assigned_by: string | null;
  executed_video_id: string | null;
  review_result: ReviewResult | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

// === 阶段 3（migration 019-032）新增类型 ===

export type SubmissionBatchStatus =
  | "draft"
  | "processing"
  | "need_confirm"
  | "ready_submit"
  | "submitted"
  | "returned"
  | "deleted";

export type PublishPrecision = "minute" | "hour" | "date" | "unknown";

export type ScriptSegmentType = "hook" | "background" | "core_point" | "action_cta" | "closing";
export type ScriptSegmentMappingStatus = "unmapped" | "estimated" | "confirmed";

export type AiInsightScope = "single_video" | "member_week" | "member_month" | "team_week" | "team_month";
export type AiDataQualityState = "sufficient" | "partial" | "insufficient";
export type AiInsightType = "growth_edit" | "period_direction";

export type ExemptionRequestType = "single" | "3days" | "4days" | "5days" | "permanent";
export type ExemptionRequestStatus = "pending" | "approved" | "rejected";

export interface SubmissionBatch {
  id: string;
  org_id: string | null;
  team_id: string | null;
  submitter_user_id: string | null;
  task_date: string;
  batch_status: SubmissionBatchStatus;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentItem {
  id: string;
  batch_id: string | null;
  org_id: string | null;
  team_id: string | null;
  account_id: string | null;
  owner_user_id: string | null;
  biz_date: string;
  task_date: string | null;
  publish_at: string | null;
  publish_precision: PublishPrecision | null;
  publish_time_text: string | null;
  uploaded_at: string | null;
  submitted_at: string | null;
  content_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptDocument {
  id: string;
  content_item_id: string;
  raw_text: string | null;
  structured_version: number | null;
  word_count: number | null;
  estimated_duration_sec: number | null;
  created_at: string;
}

export interface ScriptSegment {
  id: string;
  script_document_id: string | null;
  segment_type: ScriptSegmentType;
  segment_order: number | null;
  content: string | null;
  start_sec: number | null;
  end_sec: number | null;
  mapping_status: ScriptSegmentMappingStatus | null;
}

export interface AiInputBundle {
  id: string;
  insight_scope: AiInsightScope;
  scope_entity_id: string | null;
  input_version: number | null;
  data_quality_state: AiDataQualityState | null;
  input_json: Record<string, unknown>;
  generated_at: string;
}

export interface AiInsightResult {
  id: string;
  input_bundle_id: string | null;
  insight_type: AiInsightType;
  model_name: string | null;
  prompt_version: string | null;
  result_status: string | null;
  result_json: Record<string, unknown> | null;
  rendered_text: string | null;
  created_at: string;
}

export interface ExemptionRequest {
  id: string;
  applicant_user_id: string | null;
  team_id: string | null;
  exemption_type: ExemptionRequestType;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: ExemptionRequestStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ExemptionGrant {
  id: string;
  request_id: string | null;
  user_id: string | null;
  team_id: string | null;
  start_date: string | null;
  end_date: string | null;
  grant_type: ExemptionRequestType | null;
  status: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  org_id: string | null;
  name: string;
  is_demo: boolean | null;
  created_at: string;
}

export interface Group {
  id: string;
  team_id: string | null;
  org_id: string | null;
  name: string;
  created_at: string;
}
