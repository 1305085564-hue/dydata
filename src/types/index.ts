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
  follower_gain: number | null;
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
  followerGain: number;
  completionRate: number | null;
  watchDuration: number | null;
  bounceRate: number | null;
  completedViewers: number;
  progressRate: number | null;
  isBreakout: boolean;
}
