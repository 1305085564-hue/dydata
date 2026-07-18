import { NextRequest, NextResponse } from "next/server";

import { requireAdminModulesAccess } from "@/app/api/admin/modules/_shared";
import { loadAdminGovernanceData } from "@/lib/loaders/admin-modules";
import { createClient } from "@/lib/supabase/server";

type AdminGovernanceDeps = {
  requireModuleAccess: typeof requireAdminModulesAccess;
  createClient: typeof createClient;
  loadGovernance: typeof loadAdminGovernanceData;
};

const defaultDeps: AdminGovernanceDeps = {
  requireModuleAccess: requireAdminModulesAccess,
  createClient,
  loadGovernance: loadAdminGovernanceData,
};

export async function buildAdminGovernanceResponse(
  request: NextRequest,
  deps: AdminGovernanceDeps = defaultDeps,
) {
  const access = await deps.requireModuleAccess();
  if (access.ok !== true) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const supabase = await deps.createClient();
  const { searchParams } = new URL(request.url);

  try {
    const data = await deps.loadGovernance({
      supabase,
      searchDate: searchParams.get("date") ?? undefined,
      visibleUserIds: access.canViewAllUsers ? null : access.visibleUserIds,
    });

    if (!data) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "加载数据管理失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return buildAdminGovernanceResponse(request);
}
