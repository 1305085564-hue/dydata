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

  const emails = await deps.loadMemberEmails();
  if (!emails) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({
    emails: Object.fromEntries(
      Object.entries(emails).map(([userId, value]) => [
        userId,
        value && typeof value === "object" && "email" in value ? value.email : value,
      ]),
    ),
  });
}

export async function GET() {
  return buildAdminModuleMemberEmailsResponse();
}
