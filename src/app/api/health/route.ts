import { NextRequest, NextResponse } from "next/server";

import { logApiRequest, resolveRequestId } from "@/lib/api-logger";
import { probeDatabaseHealth, type DatabaseProbeResult } from "@/lib/database-health-probe";

type DependencyStatus = "up" | "down" | "unconfigured";

export type HealthDeps = {
  probeCloudBase?: () => Promise<DatabaseProbeResult>;
};

const defaultDeps: Required<HealthDeps> = {
  probeCloudBase: () => probeDatabaseHealth(),
};

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

export async function GET(request: NextRequest) {
  return buildHealthResponse(request);
}
