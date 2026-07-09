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
    value: "text-stone-800",
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
        "rounded-xl bg-white p-5 transition-all hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.06)] hover:-translate-y-[1px]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">
          {label}
        </span>
        {icon ? <span className="text-stone-400">{icon}</span> : null}
      </div>
      <div className={cn("mt-3 text-[24px] font-semibold leading-none tracking-tight tabular-nums", toneClass.value)}>
        {value}
      </div>
      {hint ? (
        <div className={cn("mt-2 text-[12px] font-medium", toneClass.hint)}>{hint}</div>
      ) : null}
    </div>
  );
}

export function StatsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
