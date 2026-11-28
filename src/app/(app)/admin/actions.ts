"use server";

import { actionName, validActionIds } from "@/lib/server-action-input";
import type { RestoreMemberActionResult } from "@/lib/member-lifecycle";
import type { ReviewDecision } from "@/lib/豁免流程";
import { assignOrphanExemptionMember as assignOrphanExemptionMemberImplementation,rejectOrphanExemptionRequest as rejectOrphanExemptionRequestImplementation,reviewExemptionRequest as reviewExemptionRequestImplementation } from "./action-modules/exemptions";
import { archiveMember as archiveMemberImplementation,changeRole as changeRoleImplementation,resetMemberPassword as resetMemberPasswordImplementation,restoreMember as restoreMemberImplementation,updateMemberTeam as updateMemberTeamImplementation } from "./action-modules/members";
import { createTeam as createTeamImplementation,deleteTeam as deleteTeamImplementation } from "./action-modules/teams";

export async function reviewExemptionRequest(input: {
  requestId: string;
  decision: ReviewDecision;
}): Promise<{ error?: string }> {
  if (!input || !validActionIds(input.requestId) || !["approved", "rejected"].includes(input.decision)) return { error: "申请参数格式不正确" };
  return reviewExemptionRequestImplementation(input);
}

export async function updateMemberTeam(
  targetUserId: string,
  newTeamId: string | null,
  options?: { expectedCurrentTeamId?: string | null },
): Promise<{ error?: string }> {
  if (!validActionIds(targetUserId) || (newTeamId !== null && !validActionIds(newTeamId)) || (options?.expectedCurrentTeamId != null && !validActionIds(options.expectedCurrentTeamId))) return { error: "成员或团队编号格式不正确" };
  return updateMemberTeamImplementation(targetUserId, newTeamId, options);
}

export async function assignOrphanExemptionMember(
  requestId: string,
  applicantUserId: string,
  newTeamId: string,
): Promise<{ error?: string }> {
  if (!validActionIds(requestId, applicantUserId, newTeamId)) return { error: "申请参数格式不正确" };
  return assignOrphanExemptionMemberImplementation(requestId, applicantUserId, newTeamId);
}

export async function rejectOrphanExemptionRequest(
  requestId: string,
  applicantUserId?: string,
): Promise<{ error?: string }> {
  if (!validActionIds(requestId) || (applicantUserId !== undefined && !validActionIds(applicantUserId))) return { error: "申请参数格式不正确" };
  return rejectOrphanExemptionRequestImplementation(requestId, applicantUserId);
}

export async function archiveMember(
  targetUserId: string,
  reason: string,
): Promise<{ error?: string }> {
  if (!validActionIds(targetUserId) || typeof reason !== "string" || !reason.trim() || reason.length > 500) return { error: "成员编号或归档原因格式不正确" };
  return archiveMemberImplementation(targetUserId, reason);
}

export async function restoreMember(targetUserId: string): Promise<RestoreMemberActionResult> {
  if (!validActionIds(targetUserId)) return { error: "成员编号格式不正确" };
  return restoreMemberImplementation(targetUserId);
}

export async function resetMemberPassword(
  targetUserId: string,
  newPassword: string
): Promise<{ error?: string }> {
  if (!validActionIds(targetUserId) || typeof newPassword !== "string" || newPassword.trim().length < 6 || newPassword.length > 128) return { error: "成员编号或密码格式不正确" };
  return resetMemberPasswordImplementation(targetUserId, newPassword);
}

export async function changeRole(
  targetUserId: string,
  newRole: "member" | "admin"
): Promise<{ error?: string }> {
  if (!validActionIds(targetUserId) || !["member", "admin"].includes(newRole)) return { error: "成员编号或角色格式不正确" };
  return changeRoleImplementation(targetUserId, newRole);
}

export async function createTeam(teamName: string): Promise<{ error?: string; team?: { id: string; name: string } }> {
  if (!actionName.safeParse(teamName).success) return { error: "团队名称格式不正确" };
  return createTeamImplementation(teamName);
}

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  if (!validActionIds(teamId)) return { error: "团队编号格式不正确" };
  return deleteTeamImplementation(teamId);
}
