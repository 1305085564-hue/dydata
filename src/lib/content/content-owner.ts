/** 与复盘筛选一致：账号归属优先，缺失时回退视频提交人；姓名绝不串用另一人的。 */
export function getContentOwner(video: {user_id: string; accounts?: {profile_id?: string | null} | null; profiles?: {name: string} | null}, names: Record<string,string> = {}) {
  const id = video.accounts?.profile_id ?? video.user_id;
  return { id, name: names[id] ?? (id === video.user_id ? video.profiles?.name : undefined) ?? "账号归属人" };
}
