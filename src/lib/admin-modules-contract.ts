import { normalizePermissionsForBusinessRole, type BusinessRole } from "@/lib/business-role";
import type { ExemptType, ExemptionCategory, Permissions, UserRole } from "@/types";

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
  email: string | null;
  team_id?: string | null;
  group_id?: string | null;
  team_name: string | null;
}

export interface AdminModuleMemberProfileLike extends ExemptionFields {
  id: string;
  name: string;
  role: UserRole;
  status?: string | null;
  permissions?: Permissions | null;
  team_id?: string | null;
  group_id?: string | null;
}

export interface AdminModuleMemberHydration {
  email: string | null;
  team_id?: string | null;
  team_name?: string | null;
}

function resolveMemberSummaryBusinessRole(profile: Pick<AdminModuleMemberProfileLike, "role" | "permissions">): BusinessRole {
  if (profile.role === "owner") return "owner";
  if (profile.role === "admin" && profile.permissions?.manage_members === true) return "team_admin";
  if (profile.role === "admin") return "group_leader";
  return "member";
}

export function buildAdminModuleMemberSummaries(
  profiles: AdminModuleMemberProfileLike[],
  teams: Array<{ id: string; name: string }>,
): AdminModuleMemberSummary[] {
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  return profiles.map((profile) => {
    const businessRole = resolveMemberSummaryBusinessRole(profile);

    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      status: profile.status ?? null,
      permissions: normalizePermissionsForBusinessRole(businessRole, profile.permissions ?? {}),
      email: null,
      team_id: profile.team_id ?? null,
      group_id: profile.group_id ?? null,
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
      team_id: member.team_id ?? null,
      team_name: member.team_name,
    };
  });
}
