"use server";

import type { RestoreMemberActionResult } from "@/lib/member-lifecycle";
import type { ReviewDecision } from "@/lib/豁免流程";
import { assignOrphanExemptionMember as assignOrphanExemptionMemberImplementation,rejectOrphanExemptionRequest as rejectOrphanExemptionRequestImplementation,reviewExemptionRequest as reviewExemptionRequestImplementation } from "./action-modules/exemptions";
import { archiveMember as archiveMemberImplementation,changeRole as changeRoleImplementation,resetMemberPassword as resetMemberPasswordImplementation,restoreMember as restoreMemberImplementation,updateMemberTeam as updateMemberTeamImplementation } from "./action-modules/members";
import { createTeam as createTeamImplementation,deleteTeam as deleteTeamImplementation } from "./action-modules/teams";

export async function reviewExemptionRequest(input: {
  requestId: string;
  decision: ReviewDecision;
}): Promise<{ error?: string }> {
  return reviewExemptionRequestImplementation(input);
}

export async function updateMemberTeam(
  targetUserId: string,
  newTeamId: string | null,
  options?: { expectedCurrentTeamId?: string | null },
): Promise<{ error?: string }> {
  return updateMemberTeamImplementation(targetUserId, newTeamId, options);
}

export async function assignOrphanExemptionMember(
  requestId: string,
  applicantUserId: string,
  newTeamId: string,
): Promise<{ error?: string }> {
  return assignOrphanExemptionMemberImplementation(requestId, applicantUserId, newTeamId);
}

export async function rejectOrphanExemptionRequest(
  requestId: string,
  applicantUserId?: string,
): Promise<{ error?: string }> {
  return rejectOrphanExemptionRequestImplementation(requestId, applicantUserId);
}

export async function archiveMember(
  targetUserId: string,
  reason: string,
): Promise<{ error?: string }> {
  return archiveMemberImplementation(targetUserId, reason);
}

export async function restoreMember(targetUserId: string): Promise<RestoreMemberActionResult> {
  return restoreMemberImplementation(targetUserId);
}

export async function resetMemberPassword(
  targetUserId: string,
  newPassword: string
): Promise<{ error?: string }> {
  return resetMemberPasswordImplementation(targetUserId, newPassword);
}

export async function changeRole(
  targetUserId: string,
  newRole: "member" | "admin"
): Promise<{ error?: string }> {
  return changeRoleImplementation(targetUserId, newRole);
}

export async function createTeam(teamName: string): Promise<{ error?: string; team?: { id: string; name: string } }> {
  return createTeamImplementation(teamName);
}

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  return deleteTeamImplementation(teamId);
}
