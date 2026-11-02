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
