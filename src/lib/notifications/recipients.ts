import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBusinessRole, type BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

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
      .select("id, role, team_id, group_id, permissions")
      .in("group_id", groupIds);

    return await filterByMinBusinessRole(admin, members, filter.minBusinessRole);
  }

  if (filter.scope === "team") {
    if (!profile.team_id) return [filter.userId];
    const { data: members } = await admin
      .from("profiles")
      .select("id, role, team_id, group_id, permissions")
      .eq("team_id", profile.team_id);

    return await filterByMinBusinessRole(admin, members, filter.minBusinessRole);
  }

  // all
  const { data: members } = await admin
    .from("profiles")
    .select("id, role, team_id, group_id, permissions");
  return await filterByMinBusinessRole(admin, members, filter.minBusinessRole);
}

type ProfileFull = {
  id: string | null;
  role: string | null;
  team_id: string | null;
  group_id: string | null;
  permissions: Permissions | null;
};

async function filterByMinBusinessRole(
  admin: AdminClient,
  rows: ProfileFull[] | null | undefined,
  minBusinessRole: BusinessRole | undefined,
): Promise<string[]> {
  const list = (rows ?? []).filter((row): row is ProfileFull & { id: string } => Boolean(row?.id));
  if (!minBusinessRole) return list.map((row) => row.id);

  // 按权威口径推断 businessRole 时需要 groups.leader_user_id
  // 一次性把候选人涉及的所有 group_id 查齐，避免 N+1
  const { data: groups } = await admin
    .from("groups")
    .select("id, team_id, leader_user_id");
  const allGroups = groups ?? [];

  const rank: Record<BusinessRole, number> = {
    member: 0,
    group_leader: 1,
    team_admin: 2,
    owner: 3,
  };
  const min = rank[minBusinessRole];

  return list
    .filter((row) => {
      const inferred = resolveBusinessRole(
        {
          id: row.id,
          role: (row.role ?? "member") as UserRole,
          permissions: row.permissions,
          team_id: row.team_id,
          group_id: row.group_id,
        },
        allGroups,
      );
      return rank[inferred] >= min;
    })
    .map((row) => row.id);
}
