export const NOTIFICATION_CATEGORIES = ["todo", "feed"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_STATUSES = ["unread", "read", "done", "ignored"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_SEVERITIES = ["info", "success", "warning", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_TYPES = {
  draftVideoSubmit: "draft.video_submit",
  teamInvite: "team.invite",
  systemAnnouncement: "system.announcement",
  reportRemind: "report.remind",
  aiTaskDone: "ai.task_done",
  mention: "mention",
  alertPrefix: "alert.",
} as const;

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  expires_at: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  read_at: string | null;
  done_at: string | null;
}

export interface EmitInput {
  recipients: string[];
  type: string;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  actionLabel?: string | null;
  actionUrl?: string | null;
  payload?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  expiresAt?: string | null;
}

export interface NotificationCounts {
  unread: number;
  todoOpen: number;
}
