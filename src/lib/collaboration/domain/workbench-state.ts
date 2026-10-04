import type { WorkGroupKind } from "@/app/(app)/admin/collaboration/types";
import { getShanghaiYearMonth } from "@/lib/loaders/shared";

export type TabKey = "talents" | "operators" | "writers" | "editors";

/**
 * 小队工种换算成档案卡的岗位视角。工种只有文案/达人/运营三种，
 * 剪辑只在「按岗位」视角出现，因此没有 editor 档。
 */
export const WORK_GROUP_ROLE_TAB: Record<WorkGroupKind, TabKey> = {
  writer: "writers",
  talent: "talents",
  operator: "operators",
};

export function generateMonthOptions() {
  const options: Array<{ year: number; month: number; label: string; value: string }> = [];
  const startYear = 2026;
  const startMonth = 7; // Earliest allowed month 2026-07

  const now = getShanghaiYearMonth();
  let currentYear = now.year;
  let currentMonth = now.month;

  if (currentYear < 2026 || (currentYear === 2026 && currentMonth < 7)) {
    currentYear = 2026;
    currentMonth = 7;
  }

  let y = currentYear;
  let m = currentMonth;

  for (let i = 0; i < 12; i++) {
    if (y < startYear || (y === startYear && m < startMonth)) break;
    options.push({
      year: y,
      month: m,
      label: `${y} 年 ${m} 月`,
      value: `${y}-${m}`,
    });
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }

  return options;
}
