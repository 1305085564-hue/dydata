"use server";

import { revalidatePath } from "next/cache";

import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * 岗位管理「按团队」编制写操作的 Server Action 层（唯一写入口）。
 * 每个 action 只做参数转发：门禁、本公司限制、审计都在 work-group-write.ts / work-groups.ts。
 * 禁止在 UI 侧另写一套归属赋值逻辑。
 */

const deps: WorkGroupWriteDeps = {
  resolveContext: getCurrentPermissionContext,
  createSupabase: createAdminClient,
  revalidate: () => revalidatePath(WORK_GROUPS_REVALIDATE_PATH),
};

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
  return runWorkGroupAction(
    {
      run: (context) =>
        assignWorkGroupMembers(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          groupId: input.groupId,
          userIds: input.userIds,
        }),
    },
    deps,
  );
}
