export function filterLeaderboardByVisibleUsers<T extends { profile_id?: string | null }>(
  rows: T[],
  visibleUserIds: string[]
) {
  const visible = new Set(visibleUserIds);
  return rows.filter((row) => typeof row.profile_id === "string" && visible.has(row.profile_id));
}
