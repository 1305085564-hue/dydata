import {
auditRollbackIncompleteMessage,
auditRollbackMessage
} from "@/lib/audit-log";
import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageTeamStructure } from "@/lib/team-management";
import { getTeamOptions } from "@/lib/teams";
import { revalidatePath } from "next/cache";
import { adminActionFailure,auditNotLogged,recordAdminAudit } from "./audit";

export async function createTeam(teamName: string): Promise<{ error?: string; team?: { id: string; name: string } }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!canManageTeamStructure(perm.companyRole, perm.permissions)) return { error: "无权限" };

  const normalizedName = teamName.trim();
  if (!normalizedName) return { error: "团队名称还没填" };

  const teams = await getTeamOptions();
  if (teams.some((team) => team.name === normalizedName)) {
    return { error: "团队名称已存在" };
  }

  const adminSupabase = createAdminClient();
  const { data: createdTeam, error } = await adminSupabase
    .from("teams")
    .insert({
      name: normalizedName,
    })
    .select("id, name")
    .single();
  if (error) return adminActionFailure("create-team", "创建团队失败，请稍后重试", error);

  const supabase = await createClient();
  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "create_team",
    target: normalizedName,
    detail: normalizedName,
  });
  if (!audit.ok) {
    // 建团队是一次插入，可回滚：审计没写成就把刚建的团队删掉，
    // 不留一个「没人知道是谁建的」团队。
    if (!createdTeam) return { error: auditRollbackIncompleteMessage("创建团队") };
    const rollback = await adminSupabase.from("teams").delete().eq("id", createdTeam.id);
    return { error: rollback.error ? auditRollbackIncompleteMessage("创建团队") : auditRollbackMessage("创建团队") };
  }

  revalidatePath("/admin");
  revalidatePath("/register");
  return {
    team: createdTeam
      ? {
          id: createdTeam.id,
          name: createdTeam.name ?? normalizedName,
        }
      : undefined,
  };
}

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!canManageTeamStructure(perm.companyRole, perm.permissions)) return { error: "无权限" };

  if (!perm.teamId || teamId !== perm.teamId) return { error: "无权删除该团队" };

  const adminSupabase = createAdminClient();

  // Check if team has members
  const { data: members, error: membersError } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("team_id", teamId)
    .limit(1);
  if (membersError) return adminActionFailure("delete-team-members", "加载团队成员失败，请稍后重试", membersError);
  if (members && members.length > 0) return { error: "该团队下还有成员，无法删除" };

  const { data: team } = await adminSupabase.from("teams").select("name").eq("id", teamId).single();

  const { error } = await adminSupabase.from("teams").delete().eq("id", teamId);
  if (error) return adminActionFailure("delete-team", "删除团队失败，请稍后重试", error);

  const supabase = await createClient();
  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "delete_team",
    target: teamId,
    detail: team?.name ?? teamId,
  });
  // 团队删了没法按原 id 复原（重建会换 id、也会打乱外部引用），如实报告已生效。
  if (!audit.ok) return auditNotLogged("删除团队");

  revalidatePath("/admin");
  revalidatePath("/register");
  return {};
}
