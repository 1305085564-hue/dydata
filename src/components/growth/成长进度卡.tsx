import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface GrowthProgressCardProps {
  /** 全历史累计日报份数 */
  lifetimeReportCount: number;
  /** 解锁完整体检所需份数，默认 10 */
  targetCount?: number;
  /** 断流提示文案（如"数据停在 7月1日 · 已停 15 天"），非断流为 null */
  staleText?: string | null;
}

const UNLOCK_PREVIEW = ["完播率分析", "能力画像", "团队对标"];

export function GrowthProgressCard({ lifetimeReportCount, targetCount = 10, staleText }: GrowthProgressCardProps) {
  const filled = Math.min(lifetimeReportCount, targetCount);
  const remaining = Math.max(targetCount - lifetimeReportCount, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#D97757]/30 bg-white p-6">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-[12px] font-medium uppercase tracking-widest text-stone-500">
              成长进度 · 累积期
            </span>
            <h2 className="text-[24px] font-medium leading-[1.4] text-stone-900">
              再积累 {remaining} 份日报，解锁你的第一份完整体检
            </h2>
          </div>

          <div
            className="flex items-center gap-1.5"
            role="progressbar"
            aria-valuenow={filled}
            aria-valuemin={0}
            aria-valuemax={targetCount}
            aria-label={`成长进度 ${filled}/${targetCount}`}
          >
            {Array.from({ length: targetCount }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-2 flex-1 rounded-full",
                  index < filled ? "bg-[#D97757]" : "bg-stone-200",
                )}
              />
            ))}
          </div>

          <p className="text-[13px] text-stone-500">
            已积累 {lifetimeReportCount} 份真实日报。解锁后你将得到：
          </p>
          <div className="flex flex-wrap gap-2">
            {UNLOCK_PREVIEW.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[12px] text-stone-600"
              >
                <Lock className="h-3 w-3 text-stone-400" />
                {item}
              </span>
            ))}
          </div>

          {staleText ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D99E55]/25 bg-[#D99E55]/[0.07] px-3 py-2">
              <span className="text-[12px] text-[#8A6A2F]">{staleText}</span>
              <Link
                href="/dashboard"
                className="text-[12px] font-medium text-[#8A6A2F] underline decoration-[#D99E55]/60 underline-offset-4 transition-colors hover:text-stone-900"
              >
                去同步
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-stretch gap-2 md:min-w-[200px]">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#B4532F] px-5 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#A84D2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/30"
          >
            提交今日日报
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-center text-[12px] text-stone-500">每天 1 份，{remaining} 天后解锁</p>
        </div>
      </div>
    </section>
  );
}

export { GrowthProgressCard as 成长进度卡 };
