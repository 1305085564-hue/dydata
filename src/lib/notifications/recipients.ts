import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessRole } from "@/lib/business-role";
import type { UserRole } from "@/types";

type AdminClient = SupabaseClient;

export type RecipientScope = "self" | "group" | "team" | "all";

export interface RecipientFilter {
  scope: RecipientScope;
  /**
   * "self" 时必填：通知的目标用户
   * 其他 scope 下作为"触发者"，用于推断范围
   */
  userId: string;
  /** 仅向具备某 businessRole 的用户广播（可选） */
  minBusinessRole?: BusinessRole;
}

export async function resolveRecipients(
  admin: AdminClient,
  filter: RecipientFilter,
): Promise<string[]> {
  if (filter.scope === "self") return [filter.userId];

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, team_id, group_id")
    .eq("id", filter.userId)
    .single();

  if (!profile) return [];

  if (filter.scope === "group") {
    const { data: ledGroups } = await admin
      .from("groups")
      .select("id, leader_user_id")
      .eq("leader_user_id", filter.userId);

    const ledGroupIds = (ledGroups ?? []).map((row) => row.id as string).filter(Boolean);
    const groupIds = ledGroupIds.length > 0 ? ledGroupIds : profile.group_id ? [profile.group_id] : [];
    if (groupIds.length === 0) return [filter.userId];

    const { data: members } = await admin
      .from("profiles")
      .select("id, role, permissions")
      .in("group_id", groupIds);

    return filterByMinBusinessRole(members, filter.minBusinessRole);
  }

  if (filter.scope === "team") {
    if (!profile.team_id) return [filter.userId];
    const { data: members } = await admin
      .from("profiles")
      .select("id, role, permissions")
      .eq("team_id", profile.team_id);

    return filterByMinBusinessRole(members, filter.minBusinessRole);
  }

  // all
  const { data: members } = await admin.from("profiles").select("id, role, permissions");
  return filterByMinBusinessRole(members, filter.minBusinessRole);
}

type ProfileMinimal = { id: string | null; role: string | null; permissions: Record<string, unknown> | null };

function filterByMinBusinessRole(
  rows: ProfileMinimal[] | null | undefined,
  minBusinessRole: BusinessRole | undefined,
): string[] {
  const list = (rows ?? []).filter((row): row is ProfileMinimal & { id: string } => Boolean(row?.id));
  if (!minBusinessRole) return list.map((row) => row.id);

  const rank: Record<BusinessRole, number> = {
    member: 0,
    group_leader: 1,
    team_admin: 2,
    owner: 3,
  };
  const min = rank[minBusinessRole];

  return list
    .filter((row) => {
      const role = (row.role ?? "member") as UserRole;
      const permissions = (row.permissions ?? {}) as Record<string, unknown>;
      const inferred = inferBusinessRoleSimple(role, permissions);
      return rank[inferred] >= min;
    })
    .map((row) => row.id);
}

/**
 * 简化版 businessRole 推断（不查 groups 表，权限 + role 足够区分）
 * - owner: role === 'owner'
 * - team_admin: role === 'admin' 且 permissions.manage_members === true
 * - group_leader: role === 'admin' 且 permissions.manage_members !== true
 * - member: 其他
 */
function inferBusinessRoleSimple(role: UserRole, permissions: Record<string, unknown>): BusinessRole {
  if (role === "owner") return "owner";
  if (role === "admin") {
    return permissions.manage_members === true ? "team_admin" : "group_leader";
  }
  return "member";
}
