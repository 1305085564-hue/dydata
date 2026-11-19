import type { TopicPoolView } from "./types";

/**
 * 选题库页头答案（取代诗性导语）。一页一问：「现在有多少选题可挑？」
 * 数字跟着当前视图与筛选走；还在取数时返回 null，页头先放灰色页名。
 */
export function buildTopicHubHeadline(input: {
  loading: boolean;
  totalCount: number;
  view: TopicPoolView;
  filtered: boolean;
}): string | null {
  if (input.loading) return null;
  const n = input.totalCount;
  if (input.filtered) return n > 0 ? `找到 ${n} 条选题` : "没有符合筛选的选题";
  if (input.view === "my_created") return n > 0 ? `我建了 ${n} 条选题` : "我还没建过选题";
  if (input.view === "my_claims") return n > 0 ? `我认领了 ${n} 条选题` : "我还没认领选题";
  return n > 0 ? `${n} 条干货选题` : "选题库还是空的";
}
