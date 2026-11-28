import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import {
normalizeMembershipStatus
} from "@/lib/member-lifecycle";
import { buildOriginalProfilePatch,buildRoleColumnsPatch,loadAuthUserSnapshot,loadTargetProfile,operationFailure,restoreAuthUserMetadata,rollback,syncAuthUserTeamMetadata,toProfileSnapshot,updatePendingExemptionRequestTeam,writeMemberChangeLog,writeProfile,writeProfileAndReload } from "./shared";
import type { MemberLifecycleActor,MemberLifecycleClient,MemberLifecycleOperationResult } from "./types";

export async function transferMemberToTeamWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
  newTeamId: string;
  newTeamName: string;
}): Promise<MemberLifecycleOperationResult> {
  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("transfer_team", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }

  const target = loaded.profile;
  if (input.actor.id === target.id) return operationFailure("transfer_team", "校验", new Error("不能调配自己"));
  const targetRoleResolution = resolveProfileCompanyRole(target.role, target.company_role);
  if (targetRoleResolution.conflict || !targetRoleResolution.companyRole) return operationFailure("transfer_team", "角色校验", new Error("成员角色字段冲突或无效，拒绝操作"));
  if (targetRoleResolution.companyRole === "company_owner") return operationFailure("transfer_team", "校验", new Error("不能调配团队所有者"));
  if (normalizeMembershipStatus(target.membership_status) === "archived") {
    return operationFailure("transfer_team", "校验", new Error("已归档账号不能调配团队，请先恢复账号"));
  }
  if (target.team_id === input.newTeamId) {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const beforeSnapshot = toProfileSnapshot(target);
  const auth = await loadAuthUserSnapshot(input.client, target.id);
  if (!auth.ok) return operationFailure("transfer_team", "读取 Auth 用户", auth.error);

  const profileWrite = await writeProfileAndReload(input.client, target.id, {
    ...buildRoleColumnsPatch(target, targetRoleResolution.companyRole),
    team_id: input.newTeamId,
  });
  if (profileWrite.error) {
    const rollbackErrors = profileWrite.applied
      ? await rollback([
        { label: "恢复成员团队归属", run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error },
      ])
      : [];
    return operationFailure("transfer_team", "成员资料写入", profileWrite.error, rollbackErrors);
  }
  const afterProfile = profileWrite.profile;

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: input.newTeamId,
    teamName: input.newTeamName,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("transfer_team", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const pendingExemptionUpdate = await updatePendingExemptionRequestTeam(input.client, {
    userId: target.id,
    previousTeamId: target.team_id ?? null,
    nextTeamId: input.newTeamId,
  });
  if (pendingExemptionUpdate.error) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("transfer_team", "待审批豁免归属同步", pendingExemptionUpdate.error, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: input.newTeamId,
    actionType: "transfer_team",
    operatorId: input.actor.id,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复待审批豁免归属",
        run: async () => (await updatePendingExemptionRequestTeam(input.client, {
          userId: target.id,
          previousTeamId: input.newTeamId,
          nextTeamId: target.team_id ?? null,
        })).error,
      },
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("transfer_team", "成员变更日志写入", logError, rollbackErrors);
  }

  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot: toProfileSnapshot(afterProfile),
    affectedData: {
      userId: target.id,
      teamId: input.newTeamId,
      pendingExemptionRequestIds: pendingExemptionUpdate.data?.map((row) => row.id) ?? [],
    },
  };
}

export async function removeMemberFromTeamWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
}): Promise<MemberLifecycleOperationResult> {
  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("remove_from_team", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }

  const target = loaded.profile;
  if (input.actor.id === target.id) return operationFailure("remove_from_team", "校验", new Error("不能移出自己"));
  const targetRoleResolution = resolveProfileCompanyRole(target.role, target.company_role);
  if (targetRoleResolution.conflict || !targetRoleResolution.companyRole) {
    return operationFailure("remove_from_team", "角色校验", new Error("成员角色字段冲突或无效，拒绝操作"));
  }
  if (targetRoleResolution.companyRole === "company_owner") return operationFailure("remove_from_team", "校验", new Error("不能移出团队所有者"));
  if (normalizeMembershipStatus(target.membership_status) === "archived") {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }
  if (target.team_id === null) {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const beforeSnapshot = toProfileSnapshot(target);
  const auth = await loadAuthUserSnapshot(input.client, target.id);
  if (!auth.ok) return operationFailure("remove_from_team", "读取 Auth 用户", auth.error);

  const profileWrite = await writeProfileAndReload(input.client, target.id, {
    ...buildRoleColumnsPatch(target, targetRoleResolution.companyRole),
    team_id: null,
  });
  if (profileWrite.error) {
    const rollbackErrors = profileWrite.applied
      ? await rollback([
        { label: "恢复成员团队归属", run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error },
      ])
      : [];
    return operationFailure("remove_from_team", "成员资料写入", profileWrite.error, rollbackErrors);
  }
  const afterProfile = profileWrite.profile;

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: null,
    teamName: null,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("remove_from_team", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: target.team_id ?? null,
    actionType: "remove_from_team",
    operatorId: input.actor.id,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, buildOriginalProfilePatch(target))).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("remove_from_team", "成员变更日志写入", logError, rollbackErrors);
  }

  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot: toProfileSnapshot(afterProfile),
  };
}
