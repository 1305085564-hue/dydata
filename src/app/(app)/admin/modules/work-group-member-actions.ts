"use server";

import { validActionIds } from "@/lib/server-action-input";
import { revalidatePath } from "next/cache";

import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  assignMemberWorkGroupForManagement,
  unassignMemberWorkGroupForManagement,
  type AuthenticatedWorkGroupRpcClient,
  type MemberWorkGroupWriteDeps,
} from "./work-group-member-write";

const deps: MemberWorkGroupWriteDeps = {
  resolvePermissionContext: () => getCurrentPermissionContext("company", null),
  createAdminClient,
  createAuthenticatedClient: async () => (await createClient()) as unknown as AuthenticatedWorkGroupRpcClient,
};

export async function assignWorkGroupMemberAction(input: { groupId: string; userId: string }) {
  if (!input || !validActionIds(input.groupId, input.userId)) return { ok: false as const, status: 400, message: "小队或成员编号格式不正确" };
  const result = await assignMemberWorkGroupForManagement(input, deps);
  if (result.ok) revalidatePath("/admin/modules");
  return result;
}

export async function unassignWorkGroupMemberAction(input: { groupId: string; userId: string }) {
  if (!input || !validActionIds(input.groupId, input.userId)) return { ok: false as const, status: 400, message: "小队或成员编号格式不正确" };
  const result = await unassignMemberWorkGroupForManagement(input, deps);
  if (result.ok) revalidatePath("/admin/modules");
  return result;
}
