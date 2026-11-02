"use server";

import { revalidatePath } from "next/cache";

import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";
import {
  assignWorkGroupMember,
  assignWorkGroupMembers,
  createWorkGroup,
  deleteWorkGroup,
  renameWorkGroup,
  unassignWorkGroupMember,
} from "@/lib/work-groups";

import { runWorkGroupAction, WORK_GROUPS_REVALIDATE_PATH, type WorkGroupWriteDeps } from "./work-group-write";

/**
 * 协作管理的小队结构写入口。CloudBase 的成员归属改动统一由成员管理 RPC 承接；
 * Supabase 回退仍使用原有门禁、公司范围与审计实现。
 */

const deps: WorkGroupWriteDeps = {
  resolveContext: getCurrentPermissionContext,
  createSupabase: createAdminClient,
  revalidate: () => revalidatePath(WORK_GROUPS_REVALIDATE_PATH),
};

function cloudBaseMemberManagementOnly() {
  return isCloudBaseBackend()
    ? { ok: false as const, status: 403 as const, message: "请在成员管理中调整小队" }
    : null;
}

export async function createWorkGroupAction(input: { name: string; kind: string }) {
  return runWorkGroupAction(
    {
      run: (context) =>
        createWorkGroup(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          name: input.name,
          kind: input.kind,
        }),
    },
    deps,
  );
}

export async function renameWorkGroupAction(input: { groupId: string; name: string }) {
  return runWorkGroupAction(
    {
      run: (context) =>
        renameWorkGroup(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          groupId: input.groupId,
          name: input.name,
        }),
    },
    deps,
  );
}

export async function deleteWorkGroupAction(input: { groupId: string }) {
  return runWorkGroupAction(
    {
      run: (context) =>
        deleteWorkGroup(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          groupId: input.groupId,
        }),
    },
    deps,
  );
}

export async function assignWorkGroupMemberAction(input: { groupId: string; userId: string }) {
  const blocked = cloudBaseMemberManagementOnly();
  if (blocked) return blocked;

  return runWorkGroupAction(
    {
      run: (context) =>
        assignWorkGroupMember(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          groupId: input.groupId,
          userId: input.userId,
        }),
    },
    deps,
  );
}

export async function unassignWorkGroupMemberAction(input: { groupId: string; userId: string }) {
  const blocked = cloudBaseMemberManagementOnly();
  if (blocked) return blocked;

  return runWorkGroupAction(
    {
      run: (context) =>
        unassignWorkGroupMember(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          groupId: input.groupId,
          userId: input.userId,
        }),
    },
    deps,
  );
}

export async function assignWorkGroupMembersAction(input: { groupId: string; userIds: string[] }) {
  const blocked = cloudBaseMemberManagementOnly();
  if (blocked) return blocked;

  return runWorkGroupAction(
    {
      run: (context) => assignWorkGroupMembers(context.supabase, {
        actorId: context.actorId,
        actorTeamId: context.teamId,
        groupId: input.groupId,
        userIds: input.userIds,
      }),
    },
    deps,
  );
}
