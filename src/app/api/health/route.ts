import { NextRequest, NextResponse } from "next/server";

import { logApiRequest, resolveRequestId } from "@/lib/api-logger";
import { isFaultInjectionRequested } from "@/lib/fault-injection";
import { runSupabaseKeepalive, type SupabaseKeepaliveResult } from "@/lib/supabase/keepalive";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";

type SupabaseDependencyStatus = "up" | "down" | "unconfigured";

export type HealthDeps = {
  probeSupabase: () => Promise<SupabaseKeepaliveResult>;
  probeCloudBase?: () => Promise<SupabaseKeepaliveResult>;
};

const defaultDeps: HealthDeps = {
  probeSupabase: () => runSupabaseKeepalive(),
  probeCloudBase: () => runSupabaseKeepalive(),
};

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function hasCloudBaseConfig() {
  return Boolean(
    process.env.CLOUDBASE_SERVICE_API_KEY &&
    (process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID),
  );
}

export async function buildHealthResponse(
  request: NextRequest,
  deps: HealthDeps = defaultDeps,
) {
  const requestId = resolveRequestId(request);
  const requestedCheck = new URL(request.url).searchParams.get("check");
  const startedAt = Date.now();

  // 基础存活：进程能响应即 ok，不探测任何依赖，恒为 200
  if (!requestedCheck || !["supabase", "cloudbase", "database"].includes(requestedCheck)) {
    logApiRequest({ requestId, route: "/api/health", method: request.method, status: 200 });
    return NextResponse.json({ status: "ok", checks: { server: "up" } }, { status: 200 });
  }

  const wantsCloudBase = isCloudBaseBackend() &&
    (requestedCheck === "cloudbase" || requestedCheck === "database");

  if (wantsCloudBase) {
    let statusValue: SupabaseDependencyStatus = "unconfigured";
    let probe: SupabaseKeepaliveResult | null = null;
    if (hasCloudBaseConfig()) {
      try {
        probe = await (deps.probeCloudBase ?? defaultDeps.probeCloudBase!)();
        statusValue = "up";
      } catch {
        statusValue = "down";
      }
    }

    const degraded = statusValue !== "up";
    const status = degraded ? 503 : 200;
    const cloudbase = {
      backend: "cloudbase" as const,
      status: statusValue,
      ...(probe ? {
        table: probe.table,
        rowCount: probe.rowCount,
        checkedAt: probe.checkedAt,
      } : {}),
    };

    logApiRequest({
      requestId,
      route: "/api/health",
      method: request.method,
      status,
      durationMs: Date.now() - startedAt,
      detail: {
        check: requestedCheck,
        backend: "cloudbase",
        cloudbase: statusValue,
      },
    });

    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        checks: { server: "up", cloudbase },
      },
      { status },
    );
  }

  if (requestedCheck === "cloudbase") {
    const cloudbase = { backend: "cloudbase" as const, status: "unconfigured" as const };
    logApiRequest({
      requestId,
      route: "/api/health",
      method: request.method,
      status: 503,
      durationMs: Date.now() - startedAt,
      detail: { check: requestedCheck, backend: "cloudbase", cloudbase: "unconfigured" },
    });
    return NextResponse.json(
      { status: "degraded", checks: { server: "up", cloudbase } },
      { status: 503 },
    );
  }

  if (requestedCheck === "supabase" && isCloudBaseBackend()) {
    logApiRequest({
      requestId,
      route: "/api/health",
      method: request.method,
      status: 503,
      durationMs: Date.now() - startedAt,
      detail: { check: requestedCheck, backend: "cloudbase", supabase: "unconfigured" },
    });
    return NextResponse.json(
      { status: "degraded", checks: { server: "up", supabase: "unconfigured" } },
      { status: 503 },
    );
  }

  // 依赖检查：区分「未配置」和「探活失败」，失败只报 down，
  // 绝不返回数据库错误信息、行数或用户数据
  let supabase: SupabaseDependencyStatus;
  const faultInjected = isFaultInjectionRequested("health:supabase-down", request);
  if (faultInjected) {
    supabase = "down";
  } else if (!hasSupabaseConfig()) {
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
    detail: { check: "supabase", supabase, ...(faultInjected ? { faultInjected: true } : {}) },
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
