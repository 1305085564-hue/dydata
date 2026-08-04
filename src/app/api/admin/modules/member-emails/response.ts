import { NextResponse } from "next/server";

import { loadAdminModuleMemberEmailHydration } from "@/lib/loaders/admin-modules";

import { requireAdminModulesAccess } from "../_shared";

type MemberEmailsDeps = {
  requireModuleAccess: typeof requireAdminModulesAccess;
  loadMemberEmails: typeof loadAdminModuleMemberEmailHydration;
};

export async function buildAdminModuleMemberEmailsResponse(
  deps: MemberEmailsDeps = {
    requireModuleAccess: requireAdminModulesAccess,
    loadMemberEmails: loadAdminModuleMemberEmailHydration,
  },
) {
  const access = await deps.requireModuleAccess();
  if (access.ok !== true) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const activeVisibleUserIds = access.activeVisibleUserIds;
  const emails = await deps.loadMemberEmails(activeVisibleUserIds);
  if (!emails) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const activeVisibleUserIdSet = new Set(activeVisibleUserIds);
  return NextResponse.json({
    emails: Object.fromEntries(
      Object.entries(emails)
        .filter(([userId]) => activeVisibleUserIdSet.has(userId))
        .map(([userId, value]) => [
          userId,
          value && typeof value === "object" && "email" in value ? value.email : value,
        ]),
    ),
  });
}
