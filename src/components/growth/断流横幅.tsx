import Link from "next/link";
import { Alert } from "@/components/ui/alert";
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
    <Alert
      variant="warning"
      icon={<Clock className="h-4 w-4 shrink-0 stroke-[1.5] text-[#B98A54]" />}
      className="justify-between"
    >
      <span className="text-[13px] text-[#78716C]">
        数据停在 {格式化为月日(lastReportDate)} · 已停 {daysSince} 天，下面的分析停更在那一天。
      </span>
      <Link
        href="/dashboard"
        className="inline-flex w-fit shrink-0 items-center gap-1 text-[13px] font-medium text-[#D97757] hover:text-[#C46A4D] transition-colors"
      >
        去同步今日数据 →
      </Link>
    </Alert>
  );
}

export { StaleBanner as 断流横幅, 格式化为月日 };
