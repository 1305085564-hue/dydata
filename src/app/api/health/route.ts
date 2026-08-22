import { NextRequest, NextResponse } from "next/server";

import { logApiRequest, resolveRequestId } from "@/lib/api-logger";
import { runSupabaseKeepalive, type SupabaseKeepaliveResult } from "@/lib/supabase/keepalive";

type SupabaseDependencyStatus = "up" | "down" | "unconfigured";

export type HealthDeps = {
  probeSupabase: () => Promise<SupabaseKeepaliveResult>;
};

const defaultDeps: HealthDeps = {
  probeSupabase: () => runSupabaseKeepalive(),
};

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function buildHealthResponse(
  request: NextRequest,
  deps: HealthDeps = defaultDeps,
) {
  const requestId = resolveRequestId(request);
  const deep = new URL(request.url).searchParams.get("check") === "supabase";
  const startedAt = Date.now();

  // 基础存活：进程能响应即 ok，不探测任何依赖，恒为 200
  if (!deep) {
    logApiRequest({ requestId, route: "/api/health", method: request.method, status: 200 });
    return NextResponse.json({ status: "ok", checks: { server: "up" } }, { status: 200 });
  }

  // 依赖检查：区分「未配置」和「探活失败」，失败只报 down，
  // 绝不返回数据库错误信息、行数或用户数据
  let supabase: SupabaseDependencyStatus;
  if (!hasSupabaseConfig()) {
    supabase = "unconfigured";
  } else {
    try {
      await deps.probeSupabase();
      supabase = "up";
    } catch {
      supabase = "down";
    }
  }

  const degraded = supabase !== "up";
  const status = degraded ? 503 : 200;

  logApiRequest({
    requestId,
    route: "/api/health",
    method: request.method,
    status,
    durationMs: Date.now() - startedAt,
    detail: { check: "supabase", supabase },
  });

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      checks: { server: "up", supabase },
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  return buildHealthResponse(request);
}
