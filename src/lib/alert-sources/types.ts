import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessRole } from "@/lib/business-role";

export type AlertSource = "submission" | "playback" | "violation" | "conversion" | "upload" | "task";
export type AlertSeverity = "critical" | "warning" | "info";

export interface AffectedEntity {
  type: "profile" | "account" | "video" | "task";
  id: string;
  name: string;
}

export interface SuggestedAction {
  label: string;
  type: "navigate" | "execute_tool";
  href?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  detail?: string;
  affectedEntities: AffectedEntity[];
  suggestedActions: SuggestedAction[];
  createdAt: string;
  resolvedAt?: string;
}

export type AlertSupabase = ReturnType<typeof createAdminClient>;

export interface DashboardAlertScope {
  actorUserId: string;
  businessRole: Extract<BusinessRole, "owner" | "team_admin">;
  teamId: string | null;
  visibleUserIds: string[];
}

export interface AlertDetectorContext {
  supabase: AlertSupabase;
  scope: DashboardAlertScope;
  now?: Date;
}

export interface GroupedBySeverity {
  critical: Alert[];
  warning: Alert[];
  info: Alert[];
}

export interface AlertSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  bySource: Record<AlertSource, number>;
}

export interface AlertAggregationResult {
  alerts: Alert[];
  groupedBySeverity: GroupedBySeverity;
  summary: AlertSummary;
}
