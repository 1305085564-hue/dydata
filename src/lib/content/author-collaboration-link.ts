import type { PersonProfileRole } from "@/lib/collaboration/domain/person-profile-rules";

const ROLE_TABS: Record<PersonProfileRole, string> = {
  talent: "talents", operator: "operators", writer: "writers", editor: "editors",
};
type LinkWork = {
  id: string;
  authorRole?: string | null;
  published_at?: string | null;
  report_date?: string | null;
  created_at?: string | null;
};
function workTime(work: LinkWork) {
  for (const date of [work.published_at, work.report_date]) {
    const time = date ? Date.parse(date) : NaN;
    if (Number.isFinite(time)) return time;
  }
  return -Infinity;
}

/** 只使用当前视图内最近作品的已确认岗位和业务日期；不猜岗位，不用入库时间。 */
export function buildAuthorCollaborationUrl(authorId: string, works: LinkWork[], now = new Date()): string | null {
  if (!authorId) return null;
  let latest = works[0];
  for (const work of works) {
    if (!latest || workTime(work) > workTime(latest)) latest = work;
  }
  const role = latest?.authorRole;
  if (!role || !Object.hasOwn(ROLE_TABS, role)) return null;
  const time = workTime(latest);
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" })
    .format(Number.isFinite(time) ? new Date(time) : now);
  const [year, month] = date.split("-");
  const params = new URLSearchParams({ year, month: String(Number(month)), tab: ROLE_TABS[role as PersonProfileRole], personId: authorId });
  params.set("from", "video");
  params.set("videoId", latest.id);
  return `/admin/collaboration?${params}`;
}
