import Link from "next/link";
import { Clock } from "lucide-react";

interface StaleBannerProps {
  /** YYYY-MM-DD */
  lastReportDate: string;
  daysSince: number;
}

function 格式化为月日(date: string) {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

export function StaleBanner({ lastReportDate, daysSince }: StaleBannerProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-[13px] text-[#8A6A2F]">
        <Clock className="h-4 w-4 shrink-0 stroke-[1.5]" />
        数据停在 {格式化为月日(lastReportDate)} · 已停 {daysSince} 天，下面的分析停更在那一天。
      </p>
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-[#8A6A2F] underline decoration-[#D99E55]/60 underline-offset-4 transition-colors hover:text-stone-900"
      >
        去同步今日数据
      </Link>
    </div>
  );
}

export { StaleBanner as 断流横幅, 格式化为月日 };
