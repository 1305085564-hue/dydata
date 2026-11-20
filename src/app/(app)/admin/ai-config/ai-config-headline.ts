/**
 * AI 配置页头答案（取代诗性导语）。一页一问：「AI 功能现在都能用吗？」
 * 有停摆先说停摆，其次说顶班，都没有就说全部正常。渠道要处理的条数仍由算力区那一行说。
 */
export function buildAiConfigHeadline(summary: { normal: number; fallback: number; outage: number } | null | undefined): string | null {
  if (!summary) return null;
  const { normal, fallback, outage } = summary;
  if (outage > 0) return fallback > 0 ? `${outage} 个功能停摆 · ${fallback} 个在顶班` : `${outage} 个功能停摆`;
  if (fallback > 0) return `${fallback} 个功能在顶班，其余正常`;
  return normal > 0 ? `${normal} 个功能都正常` : "还没有启用的 AI 功能";
}
