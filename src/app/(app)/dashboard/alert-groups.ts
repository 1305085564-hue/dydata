export interface DashboardAlertLike {
  id: string;
  severity: string;
  message: string;
  userId?: string | null;
  userName: string;
  checkpointLabel?: string | null;
}

export interface DashboardAlertGroup {
  userKey: string;
  userName: string;
  count: number;
  criticalCount: number;
  warningCount: number;
  alerts: DashboardAlertLike[];
}

export function groupDashboardAlerts(alerts: DashboardAlertLike[]) {
  const groups = new Map<string, DashboardAlertGroup>();

  for (const alert of alerts) {
    const userKey = alert.userId || alert.userName || alert.id;
    const group = groups.get(userKey) ?? {
      userKey,
      userName: alert.userName || "未知成员",
      count: 0,
      criticalCount: 0,
      warningCount: 0,
      alerts: [],
    };

    group.count += 1;
    if (alert.severity === "critical") group.criticalCount += 1;
    else group.warningCount += 1;
    group.alerts.push(alert);
    groups.set(userKey, group);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (right.criticalCount !== left.criticalCount) return right.criticalCount - left.criticalCount;
    if (right.count !== left.count) return right.count - left.count;
    return left.userName.localeCompare(right.userName, "zh-CN");
  });
}
