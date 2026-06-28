import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  AdminContentDiagnosticError,
  loadAdminContentDiagnostic,
} from "@/lib/admin-content-diagnostic";

type DiagnosticCompareDeps = {
  requireScopedAdminVideo: typeof requireScopedAdminVideo;
  loadAdminContentDiagnostic: typeof loadAdminContentDiagnostic;
};

const defaultDeps: DiagnosticCompareDeps = {
  requireScopedAdminVideo,
  loadAdminContentDiagnostic,
};

export async function buildAdminContentDiagnosticCompareResponse(
  request: NextRequest,
  deps: DiagnosticCompareDeps = defaultDeps,
) {
  const videoId = request.nextUrl.searchParams.get("videoId")?.trim();
  if (!videoId) {
    return NextResponse.json({ error: "缺少 videoId" }, { status: 400 });
  }

  const access = await deps.requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const payload = await deps.loadAdminContentDiagnostic(access);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AdminContentDiagnosticError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "诊断对比加载失败", code: "DIAGNOSTIC_COMPARE_FAILED" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return buildAdminContentDiagnosticCompareResponse(request);
}
