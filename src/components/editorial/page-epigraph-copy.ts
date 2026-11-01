import { formatCompactCount } from "@/app/(app)/admin/content/content-editorial-epigraph";
import type { SummaryData } from "@/app/(app)/admin/collaboration/types";
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
  collaboration: "好作品是一场默契的接力——按月翻阅每个岗位与小队的脚印。",
  pulse: "晨光先落在大盘上——看清昨日的涨落与每个人的落笔。",
  fulfillment: "创作有它自己的节拍——看见发布节奏，断更补交皆有去处。",
  topics: "好选题是一粒种子——在飞书生长，成片数据会为它立卷。",
  modules: "团队是一群人的同行——安放架构、分组与每个人的位置。",
  "ai-config": "让模型安静地待命——挑选渠道与分工，需要时自会流转。",
  caliber: "每个数字都有它的来处——写着算法，数字变了这里跟着变。",
  douyin: "绑定一次便有人替你守望——公开作品与趋势按时回到这里。",
};

export function buildPulseEpigraph(summary: PulseSummary, memberCount: number): string | null {
  if (summary.worksCount === 0) {
    return "晨光先落在大盘上——这一天案头尚无落笔，换个日期寻回回响。";
  }
  const parts = [`昨日 ${memberCount} 人落笔 ${summary.worksCount} 篇`];
  if (summary.totalPlay !== null && summary.totalPlay > 0) {
    parts.push(`合计播放 ${formatCompactCount(summary.totalPlay)}`);
  }
  if (summary.dayOverDayRate !== null && Number.isFinite(summary.dayOverDayRate)) {
    const rate = summary.dayOverDayRate;
    parts.push(`较前日${rate >= 0 ? "回暖" : "略凉"} ${Math.abs(rate).toFixed(1)}%`);
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

export function buildCollaborationEpigraph(summary: SummaryData | null): string | null {
  if (!summary) return null;
  if (summary.total === 0) {
    return "好作品是一场默契的接力——本月尚无落笔，换个月份寻回脚印。";
  }
  const parts = [`本月 ${summary.total} 篇作品`, `${summary.attributed} 篇分工清晰`];
  if (summary.unattributed > 0) parts.push(`${summary.unattributed} 篇仍在等一个署名`);
  return `好作品是一场默契的接力——${parts.join("，")}。`;
}

export function buildTopicsEpigraph(activeCount: number, poolCount: number): string | null {
  if (activeCount === 0 && poolCount === 0) return null;
  return `好选题是一粒种子——${activeCount} 枚生长中，题库尚存 ${poolCount} 枚待落土。`;
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
