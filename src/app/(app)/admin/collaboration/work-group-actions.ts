"use server";

import { revalidatePath } from "next/cache";

import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiRequest } from "@/lib/api-logger";
import {
  assignWorkGroupMember,
  assignWorkGroupMembers,
  MAX_WORK_GROUP_BATCH_ASSIGN_USERS,
  WORK_GROUP_BATCH_LIMIT_ERROR_CODE,
  createWorkGroup,
  deleteWorkGroup,
  renameWorkGroup,
  unassignWorkGroupMember,
} from "@/lib/work-groups";

import { runWorkGroupAction, WORK_GROUPS_REVALIDATE_PATH, type WorkGroupWriteDeps } from "./work-group-write";

/**
 * 数据管理「按团队」编制写操作的 Server Action 层（唯一写入口）。
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
      run: (context) => {
        const deduplicatedCount = new Set(input.userIds).size;
        if (deduplicatedCount > MAX_WORK_GROUP_BATCH_ASSIGN_USERS) {
          const requestId = crypto.randomUUID();
          logApiRequest({
            requestId,
            route: "admin.collaboration.assign-work-group-members",
            method: "SERVER_ACTION",
            userId: context.actorId,
            outcome: "rejected",
            detail: {
              actorId: context.actorId,
              teamId: context.teamId,
              groupId: input.groupId,
              requestedCount: input.userIds.length,
              deduplicatedCount,
              assignedCount: 0,
              skippedCount: 0,
              failedCount: 0,
              durationMs: 0,
              resultCode: WORK_GROUP_BATCH_LIMIT_ERROR_CODE,
            },
          });
          return Promise.resolve({
            ok: false as const,
            status: 400,
            code: WORK_GROUP_BATCH_LIMIT_ERROR_CODE,
            limit: MAX_WORK_GROUP_BATCH_ASSIGN_USERS,
            requestedCount: deduplicatedCount,
            message: `一次最多分配 ${MAX_WORK_GROUP_BATCH_ASSIGN_USERS} 人，本次选择了 ${deduplicatedCount} 人`,
          });
        }
        return assignWorkGroupMembers(context.supabase, {
          actorId: context.actorId,
          actorTeamId: context.teamId,
          groupId: input.groupId,
          userIds: input.userIds,
        });
      },
    },
    deps,
  );
}
