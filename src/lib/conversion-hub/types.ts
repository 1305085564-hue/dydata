export const SCRIPT_PURPOSES = ["violation", "conversion"] as const;
export const SCRIPT_FORMATS = ["oral", "visual", "mixed"] as const;
export const SCRIPT_USAGE_SOURCES = ["daily_report", "manual"] as const;
export const VIOLATION_EVENT_TYPES = ["限流", "警告", "删除视频", "封号", "其他"] as const;
export const APPEAL_STATUSES = ["未申诉", "申诉中", "申诉成功", "申诉失败"] as const;

export type ScriptPurpose = (typeof SCRIPT_PURPOSES)[number];
export type ScriptFormat = (typeof SCRIPT_FORMATS)[number];
export type ScriptUsageSource = (typeof SCRIPT_USAGE_SOURCES)[number];
export type ViolationEventType = (typeof VIOLATION_EVENT_TYPES)[number];
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export interface ScriptUsageRecord {
  id: string;
  case_id: string;
  recorded_by: string;
  account_id: string | null;
  account_name_snapshot: string | null;
  team_id: string | null;
  used_at: string;
  views: number;
  follows: number;
  conversion_rate: number | null;
  source: ScriptUsageSource;
  daily_report_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversionHubCase {
  id: string;
  created_at: string;
  submitted_by: string;
  script_text: string;
  purpose: ScriptPurpose;
  script_format: ScriptFormat;
  ai_analysis: Record<string, unknown> | null;
  total_views: number;
  total_follows: number;
  usage_count: number;
  weighted_conversion_rate: number | null;
  script_hash: string | null;
  parent_id: string | null;
}

export interface ViolationReasonTag {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ViolationEvent {
  id: string;
  case_id: string | null;
  account_id: string;
  event_type: ViolationEventType;
  occurred_at: string;
  platform_notice: string | null;
  screenshot_paths: string[];
  suspected_reason: string | null;
  appeal_status: AppealStatus;
  appeal_result: string | null;
  recovered_at: string | null;
  reported_by: string;
  note: string | null;
  created_at: string;
}

export interface WeeklyDecision {
  id: string;
  week_start: string;
  generated_by: "ai" | "manual";
  promote: unknown[];
  keep_testing: unknown[];
  deprecate: unknown[];
  ban: unknown[];
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}
