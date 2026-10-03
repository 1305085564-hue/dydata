import type { Recent7dHeat } from "./types";

/**
 * 七天热度唯一口径（纯函数）：
 * - completedCount：近 7 天内提交过该选题关联作品的去重成员数；
 * - inProgressCount：近 7 天内开始写且目前仍在写的去重成员数；
 * - participants：两者并集去重（同一成员同时命中只算 1 人）。
 */
export function computeRecent7dHeat(
  works: Array<{ subTopicId: string; userId: string | null }>,
  writings: Array<{ subTopicId: string; userId: string | null }>,
): Map<string, Recent7dHeat> {
  const completed = new Map<string, Set<string>>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const work of works) {
    if (!work.subTopicId || !work.userId) continue;
    const set = completed.get(work.subTopicId) ?? new Set<string>();
    set.add(work.userId);
    completed.set(work.subTopicId, set);
  }
  const writing = new Map<string, Set<string>>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const row of writings) {
    if (!row.subTopicId || !row.userId) continue;
    const set = writing.get(row.subTopicId) ?? new Set<string>();
    set.add(row.userId);
    writing.set(row.subTopicId, set);
  }
  const heat = new Map<string, Recent7dHeat>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const ids = new Set([...completed.keys(), ...writing.keys()]);
  for (const id of ids) {
    const completedSet = completed.get(id) ?? new Set<string>();
    const writingSet = writing.get(id) ?? new Set<string>();
    heat.set(id, { completedCount: completedSet.size, inProgressCount: writingSet.size, participants: new Set([...completedSet, ...writingSet]).size });
  }
  return heat;
}
