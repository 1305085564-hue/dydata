import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string;
  hint?: string | null;
  tone?: "default" | "positive" | "negative" | "accent";
  icon?: React.ReactNode;
  className?: string;
}

const TONE_CLASS: Record<NonNullable<StatsCardProps["tone"]>, { value: string; hint: string }> = {
  default: {
    value: "text-zinc-900",
    hint: "text-zinc-500",
  },
  positive: {
    value: "text-[#DC2626]",
    hint: "text-[#DC2626]/80",
  },
  negative: {
    value: "text-[#16A34A]",
    hint: "text-[#16A34A]/80",
  },
  accent: {
    value: "text-[#D97757]",
    hint: "text-[#D97757]/80",
  },
};

export function StatsCard({
  label,
  value,
  hint = null,
  tone = "default",
  icon,
  className,
}: StatsCardProps) {
  const toneClass = TONE_CLASS[tone];
  return (
    <div
      className={cn(
        "rounded-md bg-white shadow-sm p-5 transition-all hover:-translate-y-[1px] hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-normal tracking-[0.12em] text-zinc-500">
          {label}
        </span>
        {icon ? <span className="text-zinc-500">{icon}</span> : null}
      </div>
      <div className={cn("mt-3 text-[18px] font-medium leading-none tracking-tight tabular-nums", toneClass.value)}>
        {value}
      </div>
      {hint ? (
        <div className={cn("mt-2 text-[12px] font-normal", toneClass.hint)}>{hint}</div>
      ) : null}
    </div>
  );
}

export function StatsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
/* [规范对齐] 涨红跌绿已统一 */
/* [规范对齐] 卡片边框已处理 */
/* [规范对齐] 圆角已调整：卡片/面板 6px */
