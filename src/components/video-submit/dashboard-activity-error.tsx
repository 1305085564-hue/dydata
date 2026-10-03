import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DashboardActivityError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
      <ShieldAlert className="size-5 text-status-danger" aria-hidden="true" />
      <p className="text-[13px] font-normal text-[#1F1E1D]">手稿记录暂未就绪</p>
      <p className="max-w-sm text-[12px] text-[#78716C]">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-1">
        重新载入
      </Button>
    </div>
  );
}
