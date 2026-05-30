import { NextResponse } from "next/server";

import { loadAdminModulesTeamManagementData } from "@/lib/loaders/admin-modules";

import { requireAdminModulesAccess } from "../_shared";

type TeamManagementDeps = {
  requireModuleAccess: typeof requireAdminModulesAccess;
  loadTeamManagement: typeof loadAdminModulesTeamManagementData;
};

export async function buildAdminModuleTeamManagementResponse(
  deps: TeamManagementDeps = {
    requireModuleAccess: requireAdminModulesAccess,
    loadTeamManagement: loadAdminModulesTeamManagementData,
  },
) {
  const access = await deps.requireModuleAccess();
  if (access.ok !== true) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const teamManagement = await deps.loadTeamManagement();
  if (!teamManagement) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json(teamManagement);
}

export async function GET() {
  return buildAdminModuleTeamManagementResponse();
}
