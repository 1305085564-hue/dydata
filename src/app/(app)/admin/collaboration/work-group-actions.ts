"use server";

import { validActionIds } from "@/lib/server-action-input";
import { revalidatePath } from "next/cache";

import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createWorkGroup,
  deleteWorkGroup,
  renameWorkGroup,
} from "@/lib/work-groups";

import { runWorkGroupAction, WORK_GROUPS_REVALIDATE_PATH, type WorkGroupWriteDeps } from "./work-group-write";

/**
 * 协作管理的小队结构写入口。成员归属改动统一由成员管理 RPC 承接。
 */

const deps: WorkGroupWriteDeps = {
  resolveContext: getCurrentPermissionContext,
  createSupabase: createAdminClient,
  revalidate: () => revalidatePath(WORK_GROUPS_REVALIDATE_PATH),
};

const MEMBER_MANAGEMENT_ONLY = {
  ok: false as const,
  status: 403 as const,
  message: "请在成员管理中调整小队",
};

export async function createWorkGroupAction(input: { name: string; kind: string }) {
  if (!input) return { ok: false as const, status: 400, message: "小队参数格式不正确" };
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
  if (!input || !validActionIds(input.groupId)) return { ok: false as const, status: 400, message: "小队编号格式不正确" };
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
  if (!input || !validActionIds(input.groupId)) return { ok: false as const, status: 400, message: "小队编号格式不正确" };
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

export async function assignWorkGroupMemberAction(_input: { groupId: string; userId: string }) {
  void _input;
  return MEMBER_MANAGEMENT_ONLY;
}

export async function unassignWorkGroupMemberAction(_input: { groupId: string; userId: string }) {
  void _input;
  return MEMBER_MANAGEMENT_ONLY;
}

export async function assignWorkGroupMembersAction(_input: { groupId: string; userIds: string[] }) {
  void _input;
  return MEMBER_MANAGEMENT_ONLY;
}
