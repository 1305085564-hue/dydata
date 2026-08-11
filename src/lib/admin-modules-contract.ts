import { normalizeMembershipStatus } from "@/lib/member-lifecycle";
import type { DataScope, ExemptType, ExemptionCategory, MembershipStatus, Permissions, UserRole } from "@/types";

interface ExemptionFields {
  exempt_type?: ExemptType | null;
  exempt_start_date?: string | null;
  exempt_end_date?: string | null;
  exempt_reason?: string | null;
  exemption_category?: ExemptionCategory | null;
}

export interface AdminModuleMemberSummary extends ExemptionFields {
  id: string;
  name: string;
  role: UserRole;
  status: string | null;
  permissions: Permissions;
  data_scope?: DataScope | null;
  email: string | null;
  last_sign_in_at?: string | null;
  monthly_published_days?: number;
  monthly_published_count?: number;
  monthly_required_count?: number;
  membership_status?: MembershipStatus;
  archived_at?: string | null;
  archived_by?: string | null;
  archived_by_name?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: Record<string, unknown> | null;
  team_id?: string | null;
  team_name: string | null;
}

export interface AdminModuleMemberProfileLike extends ExemptionFields {
  id: string;
  name: string;
  role: UserRole;
  status?: string | null;
  permissions?: Permissions | null;
  data_scope?: DataScope | null;
  membership_status?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: Record<string, unknown> | null;
  team_id?: string | null;
}

export interface AdminModuleMemberHydration {
  email: string | null;
  last_sign_in_at?: string | null;
  team_id?: string | null;
  team_name?: string | null;
}

export function buildAdminModuleMemberSummaries(
  profiles: AdminModuleMemberProfileLike[],
  teams: Array<{ id: string; name: string }>,
): AdminModuleMemberSummary[] {
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  return profiles.map((profile) => {
    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      status: profile.status ?? null,
      permissions: profile.permissions ?? {},
      data_scope: profile.data_scope ?? "self",
      email: null,
      last_sign_in_at: null,
      monthly_published_days: 0,
      monthly_published_count: 0,
      monthly_required_count: 0,
      membership_status: normalizeMembershipStatus(profile.membership_status),
      archived_at: profile.archived_at ?? null,
      archived_by: profile.archived_by ?? null,
      archive_reason: profile.archive_reason ?? null,
      archive_snapshot: profile.archive_snapshot ?? null,
      team_id: profile.team_id ?? null,
      team_name: profile.team_id ? (teamNameById.get(profile.team_id) ?? null) : null,
      exempt_type: profile.exempt_type ?? null,
      exempt_start_date: profile.exempt_start_date ?? null,
      exempt_end_date: profile.exempt_end_date ?? null,
      exempt_reason: profile.exempt_reason ?? null,
      exemption_category: profile.exemption_category ?? null,
    };
  });
}

export function hydrateAdminModuleMemberEmails(
  members: AdminModuleMemberSummary[],
  hydrationByUserId: Record<string, string | null | AdminModuleMemberHydration>,
): AdminModuleMemberSummary[] {
  return members.map((member) => {
    const hydration = hydrationByUserId[member.id];
    if (hydration === undefined) return member;

    if (typeof hydration === "string" || hydration === null) {
      return {
        ...member,
        email: hydration,
      };
    }

    return {
      ...member,
      email: hydration.email,
      ...(hydration.last_sign_in_at !== undefined || "last_sign_in_at" in member
        ? { last_sign_in_at: hydration.last_sign_in_at ?? member.last_sign_in_at ?? null }
        : {}),
      team_id: member.team_id ?? null,
      team_name: member.team_name,
    };
  });
}


export interface AdminModuleMonthlyPublishRow {
  user_id: string | null;
  /** daily_reports 直查字段 */
  report_date?: string | null;
  /** get_fulfillment_range RPC 返回字段 */
  record_date?: string | null;
  status?: string | null;
  published_count?: number | null;
}

export interface AdminModuleMonthlyPublishStats {
  /** 实发作品条数 */
  publishedCount: number;
  /** 有实际发布记录的自然日数，仅辅助调试/后续扩展 */
  publishedDays: number;
  /** 应发条数 = 统计窗口内自然日 - 豁免日 */
  requiredCount: number;
}

const EXEMPT_MONTHLY_STATUSES = new Set(["leave", "waived", "exempted"]);

export function calculateAdminModuleMonthlyPublishStats(
  rows: AdminModuleMonthlyPublishRow[] | null | undefined,
): Record<string, AdminModuleMonthlyPublishStats> {
  const daySets = new Map<string, Set<string>>();
  const stats = new Map<string, { publishedCount: number; requiredCount: number }>();

  for (const row of rows ?? []) {
    const date = row.report_date ?? row.record_date;
    if (!row.user_id || !date) continue;

    const current = stats.get(row.user_id) ?? { publishedCount: 0, requiredCount: 0 };
    const publishedCount = Math.max(0, Number(row.published_count ?? 0));
    current.publishedCount += Number.isFinite(publishedCount) ? publishedCount : 0;

    if (!EXEMPT_MONTHLY_STATUSES.has(row.status ?? "")) {
      current.requiredCount += 1;
    }
    stats.set(row.user_id, current);

    if (publishedCount > 0) {
      if (!daySets.has(row.user_id)) {
        daySets.set(row.user_id, new Set());
      }
      daySets.get(row.user_id)?.add(date);
    }
  }

  const result: Record<string, AdminModuleMonthlyPublishStats> = {};
  for (const [userId, stat] of stats) {
    result[userId] = {
      publishedCount: stat.publishedCount,
      publishedDays: daySets.get(userId)?.size ?? 0,
      requiredCount: stat.requiredCount,
    };
  }

  return result;
}

export function applyAdminModuleMonthlyPublishStats(
  members: AdminModuleMemberSummary[],
  statsByUserId: Record<string, AdminModuleMonthlyPublishStats>,
): AdminModuleMemberSummary[] {
  return members.map((member) => {
    const stats = statsByUserId[member.id];
    return {
      ...member,
      monthly_published_days: stats?.publishedDays ?? 0,
      monthly_published_count: stats?.publishedCount ?? 0,
      monthly_required_count: stats?.requiredCount ?? 0,
    };
  });
}
