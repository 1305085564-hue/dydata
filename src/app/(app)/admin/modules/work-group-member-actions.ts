"use server";

import { revalidatePath } from "next/cache";

import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";
import { assignWorkGroupMember, unassignWorkGroupMember } from "@/lib/work-groups";

import {
  assignMemberWorkGroupForManagement,
  unassignMemberWorkGroupForManagement,
  type AuthenticatedWorkGroupRpcClient,
  type MemberWorkGroupWriteDeps,
} from "./work-group-member-write";

// 双路径：非 CloudBase 分支只给本机 Supabase 测试库用，线上不走。不要照抄，新代码只写 CloudBase 分支。待阿禅定本机测试环境后删除（见 docs/plans/待办清单.md）。
const backend: MemberWorkGroupWriteDeps["backend"] =
  isCloudBaseBackend() ? "cloudbase" : "supabase";

const deps = {
  backend,
  resolvePermissionContext: () => getCurrentPermissionContext("company", null),
  createAdminClient,
  createAuthenticatedClient: async () => (await createClient()) as unknown as AuthenticatedWorkGroupRpcClient,
  assignSupabase: assignWorkGroupMember,
  unassignSupabase: unassignWorkGroupMember,
};

export async function assignWorkGroupMemberAction(input: { groupId: string; userId: string }) {
  const result = await assignMemberWorkGroupForManagement(input, deps);
  if (result.ok) revalidatePath("/admin/modules");
  return result;
}

export async function unassignWorkGroupMemberAction(input: { groupId: string; userId: string }) {
  const result = await unassignMemberWorkGroupForManagement(input, deps);
  if (result.ok) revalidatePath("/admin/modules");
  return result;
}
