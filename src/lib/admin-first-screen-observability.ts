import { createAdminClient } from "@/lib/supabase/admin";
import type { FirstScreenMetricSnapshot } from "@/lib/admin-first-screen-contract";
import { after } from "next/server";

export interface FirstScreenObservation {
  route: string;
  statusCode: number;
  metrics: FirstScreenMetricSnapshot;
  actorUserId?: string | null;
  scopeKind?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FirstScreenObservationDeps {
  recordObservation: typeof recordFirstScreenObservation;
}

type PersistableSupabase = ReturnType<typeof createAdminClient>;

export function shouldAlertForObservation(
  observation: FirstScreenObservation,
  warnTotalMs: number,
) {
  return observation.statusCode >= 500 || observation.metrics.total >= warnTotalMs;
}

export async function recordFirstScreenObservation(
  observation: FirstScreenObservation,
  supabase: PersistableSupabase = createAdminClient(),
) {
  await supabase.from("admin_first_screen_perf_events").insert({
    route: observation.route,
    status_code: observation.statusCode,
    auth_ms: Math.round(observation.metrics.auth),
    context_ms: Math.round(observation.metrics.context),
    data_ms: Math.round(observation.metrics.data),
    total_ms: Math.round(observation.metrics.total),
    actor_user_id: observation.actorUserId ?? null,
    scope_kind: observation.scopeKind ?? null,
    metadata: observation.metadata ?? {},
  });
}

export function queueFirstScreenObservation(
  observation: FirstScreenObservation,
  deps: FirstScreenObservationDeps = {
    recordObservation: recordFirstScreenObservation,
  },
) {
  const task = async () => {
    try {
      await deps.recordObservation(observation);
    } catch (error) {
      console.error("failed to record first-screen observation", {
        route: observation.route,
        error,
      });
    }
  };

  try {
    after(task);
  } catch {
    void task();
  }
}

export function buildFirstScreenAlertText(input: {
  route: string;
  statusCode: number;
  latestTotalMs: number;
  thresholdMs: number;
  consecutiveHits: number;
}) {
  return [
    "后台首屏性能回归告警",
    `接口: ${input.route}`,
    `状态码: ${input.statusCode}`,
    `最近 total: ${input.latestTotalMs}ms`,
    `阈值: ${input.thresholdMs}ms`,
    `连续超阈值次数: ${input.consecutiveHits}`,
  ].join("\n");
}
