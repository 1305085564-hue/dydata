"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LeaderboardTab } from "./leaderboard-tab";

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaderboardDialog({
  open,
  onOpenChange,
}: LeaderboardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:max-w-5xl max-h-[88vh] overflow-y-auto p-5 sm:p-7">
        <DialogHeader className="space-y-1 pb-3 border-b border-[#E2E2DF]/70">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none" aria-hidden="true">🏆</span>
            <DialogTitle className="text-[17px] font-medium text-[#141413]">
              账号表现榜
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-[#78716C]">
            按当天、近7天与近30天横向对比团队各账号的播放量、涨粉与互动梯队表现
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2">
          {open && <LeaderboardTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

