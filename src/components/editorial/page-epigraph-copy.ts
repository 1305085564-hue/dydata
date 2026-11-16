import { formatCompactCount } from "@/app/(app)/admin/content/content-editorial-epigraph";
import type { CollaborationOverviewStats, SummaryData } from "@/app/(app)/admin/collaboration/types";
import type { PulseSummary } from "@/app/(app)/admin/pulse/pulse-filters";
import type { FulfillmentCalendarData } from "@/types/fulfillment";

/**
 * 页头案头导语文案：「诗性人文立场 —— 实时案头脉络」。
 * 静态页只用默认主编导语；有列表数据的页面由对应数据端调用下列 build* 发布脉络。
 * 数据不足时回落默认导语，不编造数字。
 */
export type PageEpigraphKey =
  | "workbench"
  | "collaboration"
  | "pulse"
  | "fulfillment"
  | "topics"
  | "modules"
  | "ai-config"
  | "caliber"
  | "douyin";

export const PAGE_EPIGRAPH_DEFAULTS: Record<PageEpigraphKey, string> = {
  workbench: "把今天的表达落成一页——从容记下，数据自会沉淀成底稿。",
  collaboration: "按月汇总全团产出篇数、播放规模与内容综合良优率。",
  pulse: "晨光先落在大盘上——看清昨日的数据涨落与作品表现。",
  fulfillment: "创作有它自己的节拍——看见发布节奏，断更补交皆有去处。",
  topics: "好选题是一粒种子——在飞书生长，成片数据会为它立卷。",
  modules: "团队是一群人的同行——安放架构、分组与每个人的位置。",
  "ai-config": "让模型安静地待命——挑选渠道与分工，需要时自会流转。",
  caliber: "每个数字都有它的来处——写着算法，数字变了这里跟着变。",
  douyin: "绑定一次便有人替你守望——公开作品与趋势按时回到这里。",
};

export function buildPulseEpigraph(summary: PulseSummary, memberCount: number): string | null {
  if (summary.worksCount === 0) {
    return "晨光先落在大盘上——这一天暂无作品发布，换个日期查看。";
  }
  const parts = [`昨日 ${memberCount} 人发布 ${summary.worksCount} 篇`];
  if (summary.totalPlay !== null && summary.totalPlay > 0) {
    parts.push(`合计播放 ${formatCompactCount(summary.totalPlay)}`);
  }
  if (summary.dayOverDayRate !== null && Number.isFinite(summary.dayOverDayRate)) {
    const rate = summary.dayOverDayRate;
    parts.push(`较前日${rate >= 0 ? "增长" : "下降"} ${Math.abs(rate).toFixed(1)}%`);
  }
  return `晨光先落在大盘上——${parts.join("，")}。`;
}

export function buildFulfillmentEpigraph(stats: FulfillmentCalendarData["stats"]): string | null {
  if (stats.totalMembers === 0) return null;
  const parts = [`今日 ${stats.publishedToday} 人发布`];
  if (stats.pendingToday > 0) parts.push(`${stats.pendingToday} 人在途`);
  parts.push(`达成率 ${stats.periodFulfillmentRate}%`);
  return `创作有它自己的节拍——${parts.join("，")}。`;
}

export function buildCollaborationEpigraph(
  overview: CollaborationOverviewStats | SummaryData | null,
): string | null {
  if (!overview) return null;
  if (!("month" in overview)) {
    if (overview.total === 0) return "本月暂无作品记录，换个月份查看产出与表现。";
    return `本月全团产出 ${overview.total} 篇`;
  }
  const scopeLabel = overview.restrictToSelf ? "个人产出" : "全团产出";
  if (overview.total === 0) {
    return `${overview.month}月${scopeLabel} 0 篇 · 暂无作品记录，换个月份查看`;
  }
  const rateText =
    overview.goodExcellentRate != null
      ? `${Math.round(overview.goodExcellentRate * 100)}%`
      : "—";
  return `${overview.month}月${scopeLabel} ${overview.total} 篇 · 总播放 ${formatCompactCount(overview.totalPlay)} · 综合良优率 ${rateText}`;
}

export function buildTopicsEpigraph(activeCount: number, poolCount: number): string | null {
  if (activeCount === 0 && poolCount === 0) return null;
  return `好选题是一粒种子——${activeCount} 个创作中，题库尚有 ${poolCount} 个待认领。`;
}

export function buildModulesEpigraph(input: {
  memberCount: number;
  teamCount: number;
  pendingCount: number;
}): string | null {
  if (input.memberCount === 0) return null;
  const parts = [`${input.teamCount} 团队`, `${input.memberCount} 同行`];
  if (input.pendingCount > 0) parts.push(`${input.pendingCount} 位待审核`);
  return `团队是一群人的同行——${parts.join("，")}。`;
}

export function buildDouyinEpigraph(accountCount: number, connectedCount: number): string | null {
  if (accountCount === 0) return null;
  return `绑定一次便有人替你守望——${accountCount} 个账号已有 ${connectedCount} 个同步中。`;
}
