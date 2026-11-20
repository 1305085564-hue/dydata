import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { getExemptionCategoryLabel } from "@/lib/exemption-category";
import type { ProfileSummary, TeamOption } from "@/lib/modules/types";
import type { WorkGroupRow, WorkGroupRosterMember } from "@/lib/work-groups";

/**
 * 成员管理页的「说法」：标题、待处理那一行、登录时间、小队位置。纯函数，便于单测。
 * 一页一问：团队里谁在哪个位置，有没有人等我安排？
 */

/** 超过这么多天没登录，算「很久没来」 */
export const STALE_LOGIN_DAYS = 30;

/** 页头即答案：「在职 18 人 · 3 个团队」；只有一个团队时直接说团队名 */
export function buildMembersHeadline(input: { activeCount: number; teams: TeamOption[] }) {
  const { activeCount, teams } = input;
  if (activeCount === 0) return "还没有在职成员";
  if (teams.length === 1) return `${teams[0].name} · 在职 ${activeCount} 人`;
  if (teams.length === 0) return `在职 ${activeCount} 人`;
  return `在职 ${activeCount} 人 · ${teams.length} 个团队`;
}

export function countUnassigned(profiles: Pick<ProfileSummary, "team_id">[]) {
  return profiles.filter((profile) => !profile.team_id).length;
}

/**
 * 页头下面那一行：等我处理的申请。没有就一句「没有待批的申请」。
 * 归属异常只有老板能处理；组长看到的是「等老板处理」，不可操作。
 */
export function buildPendingLine(input: {
  joinCount: number;
  orphanCount: number;
  canHandleOrphan: boolean;
}): { text: string; hasWork: boolean } {
  const parts: string[] = [];
  if (input.joinCount > 0) parts.push(`${input.joinCount} 位入团申请待批`);
  if (input.orphanCount > 0) {
    parts.push(
      input.canHandleOrphan
        ? `${input.orphanCount} 条申请没人能批（申请人没有团队）`
        : `${input.orphanCount} 条申请没人能批，等老板处理`,
    );
  }
  if (parts.length > 0) return { text: parts.join(" · "), hasWork: true };
  return { text: "没有待批的申请", hasWork: false };
}

function daysBetween(fromDateKey: string, toDateKey: string) {
  const from = Date.UTC(Number(fromDateKey.slice(0, 4)), Number(fromDateKey.slice(5, 7)) - 1, Number(fromDateKey.slice(8, 10)));
  const to = Date.UTC(Number(toDateKey.slice(0, 4)), Number(toDateKey.slice(5, 7)) - 1, Number(toDateKey.slice(8, 10)));
  return Math.round((to - from) / 86_400_000);
}

/** 表格里的「上次登录」：按上海日历算，今天 / 昨天 / N 天前；从未登录或很久没来标为异常 */
export function describeLastLogin(value: string | null | undefined, now: Date = new Date()): { text: string; stale: boolean } {
  if (!value) return { text: "从未登录", stale: true };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: "—", stale: false };
  const days = Math.max(0, daysBetween(formatShanghaiDateOnly(date), formatShanghaiDateOnly(now)));
  if (days === 0) return { text: "今天", stale: false };
  if (days === 1) return { text: "昨天", stale: false };
  if (days > STALE_LOGIN_DAYS) return { text: `${days} 天没来`, stale: true };
  return { text: `${days} 天前`, stale: false };
}

const WORK_GROUP_KIND_LABEL: Record<string, string> = { writer: "文案", talent: "达人", operator: "运营" };

export function workGroupLabel(group: Pick<WorkGroupRow, "name" | "kind"> | null | undefined) {
  if (!group) return null;
  const kind = WORK_GROUP_KIND_LABEL[group.kind];
  return kind ? `${group.name}（${kind}）` : group.name;
}

/** 一个人所在的小队：工种小队在前，运营小队在后；都没有返回空数组 */
export function memberWorkGroupNames(
  memberId: string,
  roster: Pick<WorkGroupRosterMember, "id" | "peerGroupId" | "operatorGroupId">[],
  groups: Pick<WorkGroupRow, "id" | "name" | "kind">[],
): string[] {
  const entry = roster.find((item) => item.id === memberId);
  if (!entry) return [];
  return [entry.peerGroupId, entry.operatorGroupId]
    .map((groupId) => (groupId ? groups.find((group) => group.id === groupId) : null))
    .map((group) => workGroupLabel(group))
    .filter((label): label is string => Boolean(label));
}

const EXEMPTION_SPAN_LABEL: Record<string, string> = {
  single: "1 天",
  yesterday: "昨天",
  "3days": "3 天",
  "4days": "4 天",
  "5days": "5 天",
  range: "一段时间",
  permanent: "长期",
};

/** 待归属申请的一句话：「请假 3 天 · 11月3日 至 11月5日」，不露出内部代码 */
export function describeOrphanRequest(request: {
  exemption_category: string | null;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
}) {
  const span = EXEMPTION_SPAN_LABEL[request.exemption_type] ?? "";
  const category = getExemptionCategoryLabel(request.exemption_category);
  const range = request.end_date && request.end_date !== request.start_date
    ? `${formatDateKey(request.start_date)} 至 ${formatDateKey(request.end_date)}`
    : formatDateKey(request.start_date);
  return `${category}${span ? ` ${span}` : ""} · ${range}`;
}

export function formatDateKey(dateKey: string) {
  return `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`;
}
