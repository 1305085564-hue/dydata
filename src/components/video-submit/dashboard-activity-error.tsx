import { Button } from "@/components/ui/button";

export function DashboardActivityError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
      <p className="inline-flex items-center gap-2 text-[14px] text-[#1F1E1D]">
        <span className="size-1.5 shrink-0 rounded-full bg-status-danger" aria-hidden />
        交过的记录没加载出来
      </p>
      <p className="max-w-sm text-[12px] text-[#78716C]">{message}</p>
      <Button type="button" variant="outline" size="m" onClick={onRetry} className="mt-1">
        重试
      </Button>
    </div>
  );
}
