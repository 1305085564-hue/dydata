export type DashboardSurfaceTone = "hero" | "panel" | "success";
export type DashboardStatusTone = "submitted" | "pending" | "editing";
export type DashboardMetricGridTone = "primary" | "secondary";

export function getDashboardSurfaceClass(tone: DashboardSurfaceTone): string {
  return `dashboard-surface dashboard-surface-${tone}`;
}

export function getDashboardStatusClass(tone: DashboardStatusTone): string {
  return `dashboard-status dashboard-status-${tone}`;
}

export function getDashboardMetricGridClass(tone: DashboardMetricGridTone): string {
  return `dashboard-metric-grid dashboard-metric-grid-${tone}`;
}
