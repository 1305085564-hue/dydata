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
    value: "text-stone-900",
    hint: "text-stone-500",
  },
  positive: {
    value: "text-[#6FAA7D]",
    hint: "text-[#6FAA7D]/80",
  },
  negative: {
    value: "text-[#C9604D]",
    hint: "text-[#C9604D]/80",
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
        "rounded-xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-[1px] hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
          {label}
        </span>
        {icon ? <span className="text-stone-500">{icon}</span> : null}
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
