import { NextRequest, NextResponse } from "next/server";

import { logApiRequest, resolveRequestId } from "@/lib/api-logger";
import { probeDatabaseHealth, type DatabaseProbeResult } from "@/lib/database-health-probe";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";

type DependencyStatus = "up" | "down" | "unconfigured";

export type HealthDeps = {
  probeSupabase?: () => Promise<DatabaseProbeResult>;
  probeCloudBase?: () => Promise<DatabaseProbeResult>;
};

const defaultDeps: Required<HealthDeps> = {
  probeSupabase: () => probeDatabaseHealth(),
  probeCloudBase: () => probeDatabaseHealth(),
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
  if (!requestedCheck || !["cloudbase", "database"].includes(requestedCheck)) {
    logApiRequest({ requestId, route: "/api/health", method: request.method, status: 200 });
    return NextResponse.json({ status: "ok", checks: { server: "up" } }, { status: 200 });
  }

  const wantsCloudBase = isCloudBaseBackend();

  if (wantsCloudBase) {
    let statusValue: DependencyStatus = "unconfigured";
    let probe: DatabaseProbeResult | null = null;
    if (hasCloudBaseConfig()) {
      try {
        probe = await (deps.probeCloudBase ?? defaultDeps.probeCloudBase)();
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

  // 双路径：非 CloudBase 分支只给本机 Supabase 测试库用，线上不走。不要照抄，新代码只写 CloudBase 分支。待阿禅定本机测试环境后删除（见 docs/plans/待办清单.md）。
  // 依赖检查：区分「未配置」和「探活失败」，失败只报 down，
  // 绝不返回数据库错误信息、行数或用户数据
  let supabase: DependencyStatus;
  if (!hasSupabaseConfig()) {
    supabase = "unconfigured";
  } else {
    try {
      await (deps.probeSupabase ?? defaultDeps.probeSupabase)();
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
    detail: { check: requestedCheck, supabase },
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
