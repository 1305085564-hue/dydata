export const ADMIN_FIRST_SCREEN_BUDGETS = {
  cockpit: {
    warnTotalMs: 2500,
  },
  content: {
    candidateLimit: 60,
    payloadLimit: 30,
    warnTotalMs: 2500,
  },
  videos: {
    candidateLimit: 60,
    payloadLimit: 30,
    warnTotalMs: 2500,
  },
  analytics: {
    maxRangeDays: 90,
    warnTotalMs: 2500,
  },
  sidebarBadges: {
    warnTotalMs: 1200,
  },
} as const;

export type FirstScreenMetricName = "auth" | "context" | "data" | "total";

export type FirstScreenMetricSnapshot = Record<FirstScreenMetricName, number>;

export function formatServerTiming(metrics: FirstScreenMetricSnapshot) {
  return (Object.entries(metrics) as Array<[FirstScreenMetricName, number]>)
    .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
    .join(", ");
}
