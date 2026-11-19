import { formatShortDate } from "@/app/(app)/admin/content/content-headline";

/**
 * 每日大盘页头答案（取代诗性导语）。一页一问：「那一天大家发了多少？」
 * 标题只说人数与篇数；总播放、日环比由下面的晴雨表说，同一个数只说一处。
 */
export function buildPulseHeadline(input: {
  date: string;
  yesterday: string;
  worksCount: number;
  memberCount: number;
}): string {
  const day = input.date === input.yesterday ? "昨天" : formatShortDate(input.date);
  if (input.worksCount === 0) return `${day}没有作品发布`;
  return `${day} · ${input.memberCount} 人发了 ${input.worksCount} 篇`;
}
