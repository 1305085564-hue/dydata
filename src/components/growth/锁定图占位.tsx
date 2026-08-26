import { Lock } from "lucide-react";
import { RadarCalibrationIllustration } from "@/components/editorial/editorial-illustrations";

interface LockedChartPlaceholderProps {
  title: string;
  description: string;
}

export function LockedChartPlaceholder({ title, description }: LockedChartPlaceholderProps) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#E5E0D6] bg-white p-5 sm:p-6 shadow-2xs">
      <div className="border-b border-[#ECE7DE] pb-3.5 flex items-center justify-between">
        <div>
          <h3 className="font-serif text-[15px] font-medium tracking-tight text-[#1C1917]">{title}</h3>
          <p className="mt-0.5 text-[12px] text-[#78716C]">数据不足时静待蓄力，不画假曲线</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F3EE] text-[11px] text-[#78716C] font-normal">
          <Lock className="size-3 text-[#78716C]" />
          待点亮
        </span>
      </div>
      <div className="relative mt-4 flex min-h-[260px] flex-1 flex-col items-center justify-center text-center p-4">
        <div className="flex justify-center -mt-2 -mb-1">
          <RadarCalibrationIllustration size={104} />
        </div>
        <div className="mt-2 max-w-[260px] space-y-1">
          <p className="text-[12.5px] leading-[1.6] text-[#78716C]">{description}</p>
        </div>
      </div>
    </section>
  );
}

export { LockedChartPlaceholder as 锁定图占位 };

