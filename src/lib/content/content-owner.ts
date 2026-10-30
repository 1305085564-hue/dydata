/** 与复盘筛选一致：账号归属优先，缺失时回退视频提交人；姓名绝不串用另一人的。 */
export function getContentOwner(video: {user_id: string; accounts?: {profile_id?: string | null} | null; profiles?: {name: string} | null}, names: Record<string,string> = {}) {
  const id = video.accounts?.profile_id ?? video.user_id;
  return { id, name: names[id] ?? (id === video.user_id ? video.profiles?.name : undefined) ?? "账号归属人" };
}

type ProfileOptionScope = {
  visibleUserIds: string[];
  activeVisibleUserIds?: string[];
};

export function buildScopedProfileOptions(
  profiles: Array<{ id: string; name: string }>,
  scope: ProfileOptionScope | null,
  fallbackProfileIds: string[] = [],
) {
  const allowedProfileIds = new Set(
    scope
      ? (scope.activeVisibleUserIds ?? scope.visibleUserIds)
      : fallbackProfileIds,
  );
  if (allowedProfileIds.size === 0) return [];

  return profiles
    .filter((profile) => allowedProfileIds.has(profile.id))
    .map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" }));
}
