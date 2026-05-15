import { detectConversionAlerts } from "./conversion";
import { detectPlaybackAlerts } from "./playback";
import { detectSubmissionAlerts } from "./submission";
import { detectTaskAlerts } from "./task";
import type {
  Alert,
  AlertAggregationResult,
  AlertDetectorContext,
  AlertSeverity,
  AlertSource,
  AlertSummary,
  GroupedBySeverity,
} from "./types";
import { detectUploadAlerts } from "./upload";
import { detectViolationAlerts } from "./violation";

const SOURCE_ORDER: AlertSource[] = ["submission", "playback", "violation", "conversion", "upload", "task"];
const SEVERITY_ORDER: AlertSeverity[] = ["critical", "warning", "info"];

function severityRank(severity: AlertSeverity) {
  return SEVERITY_ORDER.indexOf(severity);
}

function sourceRank(source: AlertSource) {
  return SOURCE_ORDER.indexOf(source);
}

function entityKey(alert: Alert) {
  return alert.affectedEntities
    .map((entity) => `${entity.type}:${entity.id}`)
    .sort()
    .join("|");
}

function buildSummary(alerts: Alert[]): AlertSummary {
  const bySource = {
    submission: 0,
    playback: 0,
    violation: 0,
    conversion: 0,
    upload: 0,
    task: 0,
  } satisfies Record<AlertSource, number>;

  for (const alert of alerts) {
    bySource[alert.source] += 1;
  }

  return {
    total: alerts.length,
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length,
    info: alerts.filter((alert) => alert.severity === "info").length,
    bySource,
  };
}

function groupBySeverity(alerts: Alert[]): GroupedBySeverity {
  return {
    critical: alerts.filter((alert) => alert.severity === "critical"),
    warning: alerts.filter((alert) => alert.severity === "warning"),
    info: alerts.filter((alert) => alert.severity === "info"),
  };
}

function dedupeAlerts(alerts: Alert[]) {
  const deduped = new Map<string, Alert>();
  for (const alert of alerts) {
    const key = `${alert.source}:${entityKey(alert)}`;
    if (!deduped.has(key)) {
      deduped.set(key, alert);
    }
  }
  return Array.from(deduped.values());
}

export async function aggregateDashboardAlerts(context: AlertDetectorContext): Promise<AlertAggregationResult> {
  const detectorResults = await Promise.all([
    detectSubmissionAlerts(context),
    detectPlaybackAlerts(context),
    detectViolationAlerts(context),
    detectConversionAlerts(context),
    detectUploadAlerts(context),
    detectTaskAlerts(context),
  ].map((job) =>
    job.catch((error) => {
      console.error("[dashboard-alerts] detector failed", error);
      return [] as Alert[];
    }),
  ));

  const sorted = detectorResults
    .flat()
    .sort((left, right) => {
      const severityDiff = severityRank(left.severity) - severityRank(right.severity);
      if (severityDiff !== 0) return severityDiff;
      const sourceDiff = sourceRank(left.source) - sourceRank(right.source);
      if (sourceDiff !== 0) return sourceDiff;
      return right.createdAt.localeCompare(left.createdAt);
    });

  const alerts = dedupeAlerts(sorted);
  return {
    alerts,
    groupedBySeverity: groupBySeverity(alerts),
    summary: buildSummary(alerts),
  };
}
