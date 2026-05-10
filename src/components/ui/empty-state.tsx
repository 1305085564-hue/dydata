import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center",
        className
      )}
    >
      <Icon className="size-5 stroke-[1.5] text-zinc-400" />
      <div className="space-y-1">
        <p className="text-[13px] font-medium tracking-tight text-zinc-500">{title}</p>
        {description && (
          <p className="max-w-[240px] text-[12px] leading-[1.7] text-zinc-400">{description}</p>
        )}
      </div>
      {action && (
        <Button variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
