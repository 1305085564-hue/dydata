import type { CallStats } from "@/lib/ai-config/call-stats-contract";
import { formatRate, rateTone } from "./duty-view";

type BusinessSummary = { normal: number; fallback: number; outage: number; needsAttentionChannels?: number };

/**
 * AI 配置页头答案。一页一问：「最近 AI 调用有没有出事？坏在哪？」
 * 顺序：功能停摆 > 顶班 > 渠道近期在出错 > 渠道要你处理 > 近 3 天调用整体情况 > 功能都正常。
 * 调用统计没到时只按功能状态说，不拿别的数凑。
 */
export function buildAiConfigHeadline(
  summary: BusinessSummary | null | undefined,
  stats?: CallStats | null,
): string | null {
  if (!summary) return null;
  const { normal, fallback, outage } = summary;
  if (outage > 0) return fallback > 0 ? `${outage} 个功能停摆 · ${fallback} 个在顶班` : `${outage} 个功能停摆`;
  if (fallback > 0) return `${fallback} 个功能在顶班，其余正常`;

  const failingChannels = stats?.channels.filter((c) => rateTone(c.recent, "recent") === "danger").length ?? 0;
  if (failingChannels > 0) return `功能都还能用 · ${failingChannels} 条渠道近期在出错`;

  const attention = summary.needsAttentionChannels ?? 0;
  if (attention > 0) return `功能都正常 · ${attention} 条渠道要你处理`;

  if (stats) {
    let calls = 0;
    let successes = 0;
    for (const feature of stats.features) {
      if (feature.recent.calls === 0 || feature.recent.successRate === null) continue;
      calls += feature.recent.calls;
      successes += feature.recent.calls * feature.recent.successRate;
    }
    if (calls > 0) {
      const win = { calls, successRate: successes / calls, avgMs: null };
      const rate = formatRate(win);
      return rateTone(win, "recent") ? `近 3 天调用成功 ${rate}` : `近 3 天调用都正常 · 成功 ${rate}`;
    }
  }

  return normal > 0 ? `${normal} 个功能都正常` : "还没有启用的 AI 功能";
}
