import { NextRequest, NextResponse } from "next/server";

import { requireAdminModulesAccess } from "@/app/api/admin/modules/_shared";
import {
  loadAdminModulesData,
  type AdminModulesData,
} from "@/lib/loaders/admin-modules";
import { createClient } from "@/lib/supabase/server";

type ModulesAccess = Awaited<ReturnType<typeof requireAdminModulesAccess>>;

type AdminPanelsModulesDeps = {
  requireModuleAccess: typeof requireAdminModulesAccess;
  createClient: typeof createClient;
  loadModules: typeof loadAdminModulesData;
};

const defaultDeps: AdminPanelsModulesDeps = {
  requireModuleAccess: requireAdminModulesAccess,
  createClient,
  loadModules: loadAdminModulesData,
};

function scopeAdminModulesData(data: AdminModulesData, access: Extract<ModulesAccess, { ok: true }>) {
  if (access.canViewAllUsers) return data;

  const visibleUserIds = new Set(access.visibleUserIds);
  const allProfiles = data.allProfiles.filter((profile) => visibleUserIds.has(profile.id));
  const teamManagementProfiles = data.teamManagement.profiles.filter((profile) => visibleUserIds.has(profile.id));
  const leaderCandidates = data.teamManagement.leaderCandidates.filter((profile) => visibleUserIds.has(profile.id));
  const visibleTeamIds = new Set(
    [...allProfiles, ...teamManagementProfiles, ...leaderCandidates]
      .map((profile) => profile.team_id)
      .filter((teamId): teamId is string => Boolean(teamId)),
  );

  return {
    ...data,
    allProfiles,
    teams: data.teams.filter((team) => visibleTeamIds.has(team.id)),
    teamManagement: {
      ...data.teamManagement,
      teams: data.teamManagement.teams.filter((team) => visibleTeamIds.has(team.id)),
      groups: data.teamManagement.groups.filter((group) => Boolean(group.team_id && visibleTeamIds.has(group.team_id))),
      profiles: teamManagementProfiles,
      leaderCandidates,
    },
  };
}

export async function buildAdminPanelsModulesResponse(
  request: NextRequest,
  deps: AdminPanelsModulesDeps = defaultDeps,
) {
  const access = await deps.requireModuleAccess();
  if (access.ok !== true) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const supabase = await deps.createClient();
  const { searchParams } = new URL(request.url);

  try {
    const data = await deps.loadModules({
      supabase,
      searchDate: searchParams.get("date") ?? undefined,
    });

    if (!data) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    return NextResponse.json(scopeAdminModulesData(data, access));
  } catch {
    return NextResponse.json({ error: "加载权限模块失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return buildAdminPanelsModulesResponse(request);
}
