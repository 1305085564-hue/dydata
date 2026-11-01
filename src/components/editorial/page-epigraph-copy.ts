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
  workbench: "把今天的表达落成一页——从容记下，数据会替你沉淀成复盘的底稿。",
  collaboration: "好作品是一场默契的接力——按月翻阅每个岗位与小队留下的脚印。",
  pulse: "晨光先落在大盘上——三分钟，看清昨日的涨落与每个人的落笔。",
  fulfillment: "创作有它自己的节拍——看见每位成员的发布节奏，断更与补交都有去处。",
  topics: "好选题是一粒种子——选定后在飞书生长，成片的数据会为它立卷。",
  modules: "团队是一群人的同行——在这里安放架构、分组与每个人的位置。",
  "ai-config": "让模型安静地待命——在这里挑选渠道与分工，需要时它们自会流转。",
  caliber: "每个数字都有它的来处——下面写着算法，数字变了，这里会跟着变。",
  douyin: "绑定一次，便有人替你守望——公开作品与账号趋势会按时回到这里。",
};

export function buildPulseEpigraph(summary: PulseSummary, memberCount: number): string | null {
  if (summary.worksCount === 0) {
    return "晨光先落在大盘上——这一天案头尚无落笔，可换个日期寻回其他时刻的回响。";
  }
  const parts = [`这一天 ${memberCount} 位成员落笔 ${summary.worksCount} 篇`];
  if (summary.totalPlay !== null && summary.totalPlay > 0) {
    parts.push(`合计播放 ${formatCompactCount(summary.totalPlay)}`);
  }
  if (summary.dayOverDayRate !== null && Number.isFinite(summary.dayOverDayRate)) {
    const rate = summary.dayOverDayRate;
    parts.push(`较前一日${rate >= 0 ? "回暖" : "略凉"} ${Math.abs(rate).toFixed(1)}%`);
  }
  return `晨光先落在大盘上——${parts.join("，")}。`;
}

export function buildFulfillmentEpigraph(stats: FulfillmentCalendarData["stats"]): string | null {
  if (stats.totalMembers === 0) return null;
  const parts = [`今日 ${stats.publishedToday} 位已发布`];
  if (stats.pendingToday > 0) parts.push(`${stats.pendingToday} 位还在路上`);
  parts.push(`本期达成 ${stats.periodFulfillmentRate}%`);
  return `创作有它自己的节拍——${parts.join("，")}。`;
}

export function buildCollaborationEpigraph(summary: SummaryData | null): string | null {
  if (!summary) return null;
  if (summary.total === 0) {
    return "好作品是一场默契的接力——这个月案头还没有落笔，换个月份也许能寻回脚印。";
  }
  const parts = [`本月 ${summary.total} 篇作品`, `${summary.attributed} 篇分工清晰`];
  if (summary.unattributed > 0) parts.push(`${summary.unattributed} 篇仍在等一个署名`);
  return `好作品是一场默契的接力——${parts.join("，")}。`;
}

export function buildTopicsEpigraph(activeCount: number, poolCount: number): string | null {
  if (activeCount === 0 && poolCount === 0) return null;
  return `好选题是一粒种子——${activeCount} 枚正在生长，题库里还备着 ${poolCount} 枚等待落土。`;
}

export function buildModulesEpigraph(input: {
  memberCount: number;
  teamCount: number;
  pendingCount: number;
}): string | null {
  if (input.memberCount === 0) return null;
  const parts = [`${input.teamCount} 个团队`, `${input.memberCount} 位同行`];
  if (input.pendingCount > 0) parts.push(`${input.pendingCount} 位新朋友等你点头`);
  return `团队是一群人的同行——${parts.join("，")}。`;
}

export function buildDouyinEpigraph(accountCount: number, connectedCount: number): string | null {
  if (accountCount === 0) return null;
  return `绑定一次，便有人替你守望——${accountCount} 个账号中已有 ${connectedCount} 个在安静同步。`;
}
