import { Lock } from "lucide-react";

interface LockedChartPlaceholderProps {
  title: string;
  description: string;
}

export function LockedChartPlaceholder({ title, description }: LockedChartPlaceholderProps) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="border-b border-stone-200 pb-3">
        <h3 className="text-[18px] font-medium tracking-tight text-stone-900">{title}</h3>
        <p className="mt-1 text-[12px] text-stone-500">数据不足时占位，不画假曲线。</p>
      </div>
      <div className="relative mt-4 flex min-h-[280px] flex-1 items-center justify-center sm:min-h-[320px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="8" y1="25" x2="92" y2="25" stroke="#E7E5E4" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1="8" y1="50" x2="92" y2="50" stroke="#E7E5E4" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1="8" y1="75" x2="92" y2="75" stroke="#E7E5E4" strokeWidth="0.5" strokeDasharray="3 3" />
          <path
            d="M 8 70 L 25 55 L 42 62 L 60 40 L 78 48 L 92 30"
            fill="none"
            stroke="#D6D3D1"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        </svg>
        <div className="relative flex flex-col items-center gap-2 rounded-xl border border-stone-200 bg-white/90 px-5 py-4 text-center shadow-sm backdrop-blur-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-400">
            <Lock className="h-4 w-4" />
          </span>
          <p className="max-w-[220px] text-[13px] leading-[1.6] text-stone-500">{description}</p>
        </div>
      </div>
    </section>
  );
}

export { LockedChartPlaceholder as 锁定图占位 };
