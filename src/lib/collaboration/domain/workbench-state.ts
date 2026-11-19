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

/**
 * 拆分文案名单：
 * - activeWriters：已在 writerStaff 中（已认证或本月有产出）+ 候选里已认证但尚未入列的成员
 * - uncertifiedCandidates：未在 writerStaff 中且未认证的零产出候选成员（默认折叠在表底）
 * Toolbar 徽标计数与 WriterTab 默认主表行数同源，杜绝两边口径漂移。
 */
export function partitionWriterCandidates<
  TStaff extends { userId: string },
  TCandidate extends { userId: string; certified: boolean },
>(writerStaff: TStaff[], candidates: TCandidate[] = []) {
  const existingUserIds = new Set(writerStaff.map((w) => w.userId));
  const certifiedSupplemental: TCandidate[] = [];
  const uncertifiedCandidates: TCandidate[] = [];

  for (const candidate of candidates) {
    if (existingUserIds.has(candidate.userId)) continue;
    if (candidate.certified) {
      certifiedSupplemental.push(candidate);
    } else {
      uncertifiedCandidates.push(candidate);
    }
  }

  return {
    activeWriterCount: writerStaff.length + certifiedSupplemental.length,
    certifiedSupplemental,
    uncertifiedCandidates,
  };
}

/** 当前登录用户本人在表格中存在时，稳定置顶到第一行，其余行保持原有排序。 */
export function pinCurrentUserFirst<T extends { userId: string }>(
  rows: T[],
  currentUserId?: string | null,
): T[] {
  if (!currentUserId) return rows;
  const selfIndex = rows.findIndex((row) => row.userId === currentUserId);
  if (selfIndex <= 0) return rows;
  return [rows[selfIndex], ...rows.slice(0, selfIndex), ...rows.slice(selfIndex + 1)];
}

export const ROLE_ZERO_OUTPUT_RULE_TEXT: Record<TabKey, string> = {
  talents: "你本月暂无计入该岗位的作品（统计规则：按名下绑定账号在本月发布的作品统计）",
  operators: "你本月暂无计入该岗位的作品（统计规则：仅统计为他人孵化、负责账号的跨账号作品，自营账号归入达人）",
  writers: "你本月暂无计入该岗位的作品（统计规则：统计本人本月署名文案的作品；管理员认证后计入文案绩效）",
  editors: "你本月暂无计入该岗位的作品（统计规则：仅统计为他人账号协同剪辑的作品，自营账号剪辑不计入）",
};

/**
 * 页面标题＝这个月的事实结论（一页一问：这个月谁干得好？先给全团底数）。
 * 只写事实，不点名掉队；组员只看自己时写「我的」。
 */
export function buildCollaborationHeadline(input: {
  month: number;
  loadFailed?: boolean;
  overview: { total: number; goodExcellentRate: number | null; restrictToSelf?: boolean } | null;
}): string {
  const { month, loadFailed = false, overview } = input;
  if (loadFailed) return `${month}月 · 数据没加载出来`;
  if (!overview) return `${month}月`;
  const scope = overview.restrictToSelf ? "我的" : "全团";
  if (overview.total === 0) return `${month}月 · ${scope}还没有作品`;
  const rate =
    overview.goodExcellentRate != null ? `，良优率 ${Math.round(overview.goodExcellentRate * 100)}%` : "";
  return `${month}月 · ${scope} ${overview.total} 篇${rate}`;
}
