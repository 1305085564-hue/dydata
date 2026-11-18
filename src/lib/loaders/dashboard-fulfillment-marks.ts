import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

export type MonthFulfillmentBasis = {
  joinedDate: string | null;
  manualMarkedDates: string[];
};

export type FulfillmentMarkRow = { record_date: string; status?: string | null; reason: string | null };

/**
 * 工作台读取成员自己的管理员标记（发布管理写入的 fulfillment_records）：
 * 缺勤单独展示；请假/豁免/确认已发属于"管理员已处理"，与入职日一起供「漏 y 天」对齐管理端未确认口径。
 */
export function resolveDashboardFulfillmentMarks(
  records: readonly FulfillmentMarkRow[],
  profileCreatedAt: string | null | undefined,
) {
  const absent = records.filter((row) => row.status === "absent");
  const monthFulfillmentBasis: MonthFulfillmentBasis = {
    joinedDate: profileCreatedAt ? formatShanghaiDateOnly(new Date(profileCreatedAt)) : null,
    manualMarkedDates: records.filter((row) => row.status !== "absent").map((row) => row.record_date).sort(),
  };
  return {
    absentDates: absent.map((row) => row.record_date).sort(),
    absentReasons: Object.fromEntries(
      absent.map((row) => [row.record_date, row.reason?.trim() || "管理员认定缺勤"]),
    ),
    monthFulfillmentBasis,
  };
}
