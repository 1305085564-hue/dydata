"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getShanghaiYearMonth } from "@/lib/business-time";
import { LeaderboardTab } from "./leaderboard-tab";

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
}

export function LeaderboardDialog({
  open,
  onOpenChange,
  year,
  month,
}: LeaderboardDialogProps) {
  const now = getShanghaiYearMonth();
  const isCurrentMonth = year === now.year && month === now.month;
  const dialogTitle = isCurrentMonth ? "实时账号排行" : `${month}月账号排行`;
  const dialogDescription = isCurrentMonth
    ? "按当天、近7天与近30天横向对比团队各账号的播放量、涨粉与互动梯队表现"
    : `${year} 年 ${month} 月全月横向对比团队各账号的播放量、涨粉与互动梯队表现`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:max-w-5xl max-h-[88vh] overflow-y-auto p-5 sm:p-7">
        <DialogHeader className="space-y-1 pb-3 border-b border-[#E2E2DF]/60">
          <DialogTitle>
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[#78716C]">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2">
          {open && (
            <LeaderboardTab
              year={isCurrentMonth ? undefined : year}
              month={isCurrentMonth ? undefined : month}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

