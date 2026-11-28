import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import {
buildArchiveMemberProfilePatch,
buildRestoreMemberProfilePatch,
canArchiveMember,
canRestoreMember,
normalizeMembershipStatus,
type MemberArchiveSnapshot
} from "@/lib/member-lifecycle";
import { buildOriginalProfilePatch,loadAuthUserSnapshot,loadName,loadTargetProfile,operationFailure,restoreAuthUserMetadata,rollback,setAuthBan,syncAuthUserTeamMetadata,toProfileSnapshot,writeMemberChangeLog,writeProfile,writeProfileAndReload } from "./shared";
import type { MemberLifecycleActor,MemberLifecycleClient,MemberLifecycleOperationResult } from "./types";

export async function archiveMemberWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
  reason: string;
  archivedAt: string;
}): Promise<MemberLifecycleOperationResult> {
  const reason = input.reason.trim();
  if (!reason) return operationFailure("archive", "校验归档原因", new Error("归档必须填写原因"));
  if (reason.length > 500) return operationFailure("archive", "校验归档原因", new Error("归档原因不能超过 500 个字符"));

  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("archive", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }
  const target = loaded.profile;

  const targetRoleResolution = resolveProfileCompanyRole(target.role, target.company_role);
  if (targetRoleResolution.conflict || !targetRoleResolution.companyRole) {
    return operationFailure("archive", "角色校验", new Error("成员角色字段冲突或无效，拒绝操作"));
  }

  if (!canArchiveMember({
    actorRole: input.actor.role,
    actorCompanyRole: input.actor.companyRole,
    actorPermissions: input.actor.permissions,
    actorTeamId: input.actor.teamId,
    actorId: input.actor.id,
    target,
  })) {
    return operationFailure("archive", "权限校验", new Error("不能归档当前管理范围外的成员"));
  }
  if (normalizeMembershipStatus(target.membership_status) === "archived") {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const [team, auth] = await Promise.all([
    loadName(input.client, "teams", target.team_id ?? null),
    loadAuthUserSnapshot(input.client, target.id),
  ]);
  if (team.error) return operationFailure("archive", "加载团队快照", new Error(team.error));
  if (!auth.ok) return operationFailure("archive", "读取 Auth 用户", auth.error);

  const beforeSnapshot = toProfileSnapshot(target);
  const archiveSnapshot: MemberArchiveSnapshot = {
    role: target.role,
    ...(target.company_role !== undefined ? { company_role: target.company_role } : {}),
    permissions: target.permissions ?? {},
    team_id: target.team_id ?? null,
    team_name: team.name,
  };
  const profilePatch = buildArchiveMemberProfilePatch({
    target,
    archivedBy: input.actor.id,
    reason,
    archivedAt: input.archivedAt,
    snapshot: archiveSnapshot,
  });
  const banError = await setAuthBan(input.client, target.id, true);
  if (banError) return operationFailure("archive", "Auth 封禁", banError);

  const profileWrite = await writeProfileAndReload(input.client, target.id, profilePatch);
  if (profileWrite.error) {
    const rollbackErrors = await rollback([
      ...(profileWrite.applied
        ? [{ label: "恢复成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) }]
        : []),
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("archive", "成员资料写入", profileWrite.error, rollbackErrors);
  }
  const afterProfile = profileWrite.profile;

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: null,
    teamName: null,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      { label: "恢复成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) },
      { label: "恢复 Auth 团队元数据", run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata) },
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("archive", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: target.team_id ?? null,
    actionType: "archive",
    operatorId: input.actor.id,
    reason,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      { label: "恢复成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) },
      { label: "恢复 Auth 团队元数据", run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata) },
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("archive", "成员变更日志写入", logError, rollbackErrors);
  }

  const afterSnapshot = {
    ...toProfileSnapshot(afterProfile),
  };
  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot,
    affectedData: { userId: target.id, archiveReason: reason },
  };
}

export async function restoreMemberWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
}): Promise<MemberLifecycleOperationResult> {
  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("restore", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }
  const target = loaded.profile;

  const targetRoleResolution = resolveProfileCompanyRole(target.role, target.company_role);
  if (targetRoleResolution.conflict || !targetRoleResolution.companyRole) {
    return operationFailure("restore", "角色校验", new Error("成员角色字段冲突或无效，拒绝操作"));
  }

  if (!canRestoreMember({
    actorRole: input.actor.role,
    actorCompanyRole: input.actor.companyRole,
    actorPermissions: input.actor.permissions,
    actorTeamId: input.actor.teamId,
    actorId: input.actor.id,
    target,
  })) {
    return operationFailure("restore", "权限校验", new Error("不能恢复当前管理范围外的成员"));
  }
  if (normalizeMembershipStatus(target.membership_status) === "active") {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const auth = await loadAuthUserSnapshot(input.client, target.id);
  if (!auth.ok) return operationFailure("restore", "读取 Auth 用户", auth.error);
  const beforeSnapshot = toProfileSnapshot(target);
  // 带回归档前的团队，原团队管理员才看得到；团队已被删除就不分配，由调用方明确提示
  const snapshotTeamId = target.archive_snapshot?.team_id ?? null;
  const snapshotTeam = await loadName(input.client, "teams", snapshotTeamId);
  if (snapshotTeam.error) return operationFailure("restore", "核对归档前团队", new Error(snapshotTeam.error));
  const restoredTeamId = snapshotTeam.name ? snapshotTeamId : null;
  const restorePatch = buildRestoreMemberProfilePatch(restoredTeamId);
  const undoProfile = { label: "恢复归档成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) };
  const undoBan = { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) };

  const unbanError = await setAuthBan(input.client, target.id, false);
  if (unbanError) return operationFailure("restore", "解除 Auth 封禁", unbanError);

  const profileWrite = await writeProfileAndReload(input.client, target.id, restorePatch);
  if (profileWrite.error) {
    const rollbackErrors = await rollback([...(profileWrite.applied ? [undoProfile] : []), undoBan]);
    return operationFailure("restore", "成员资料写入", profileWrite.error, rollbackErrors);
  }
  const afterProfile = profileWrite.profile;

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: restoredTeamId,
    teamName: snapshotTeam.name ?? null,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([undoProfile, undoBan]);
    return operationFailure("restore", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: restoredTeamId,
    actionType: "restore",
    operatorId: input.actor.id,
  });
  if (logError) {
    const rollbackErrors = await rollback([undoProfile, undoBan]);
    return operationFailure("restore", "成员变更日志写入", logError, rollbackErrors);
  }

  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot: toProfileSnapshot(afterProfile),
    affectedData: { userId: target.id, restoredTeamId, restoredTeamName: snapshotTeam.name ?? null, teamMissing: Boolean(snapshotTeamId && !restoredTeamId) },
  };
}
