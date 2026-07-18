export const SCRIPT_FORMATS = ["oral", "visual", "mixed"] as const;
export const SCRIPT_USAGE_SOURCES = ["daily_report", "manual"] as const;
export const VIOLATION_EVENT_TYPES = ["限流", "警告", "删除视频", "封号", "其他"] as const;
export const APPEAL_STATUSES = ["未申诉", "申诉中", "申诉成功", "申诉失败"] as const;

export type ScriptFormat = (typeof SCRIPT_FORMATS)[number];
export type ScriptUsageSource = (typeof SCRIPT_USAGE_SOURCES)[number];
export type ViolationEventType = (typeof VIOLATION_EVENT_TYPES)[number];
export type AppealStatus = (typeof APPEAL_STATUSES)[number];
