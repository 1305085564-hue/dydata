"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataManager } from "./data-manager";
import { ExportButton } from "./export-button";

interface GovernanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canExportData: boolean;
  canEditData: boolean;
  fullReports: Parameters<typeof DataManager>[0]["reports"];
  defaultDate: string;
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
}

export function GovernanceDialog({
  open,
  onOpenChange,
  canExportData,
  canEditData,
  fullReports,
  defaultDate,
  avgPlayBySubmitter,
  dayCountBySubmitter,
  avgPlayByAccount,
  dayCountByAccount,
}: GovernanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[768px] !max-w-[calc(100vw-2rem)] h-[384px] rounded-2xl border border-zinc-200 bg-white p-0 flex flex-col">
        <DialogHeader className="border-b border-zinc-200 px-6 py-4 shrink-0">
          <DialogTitle className="text-[18px] font-medium tracking-tight text-zinc-800">
            数据管理
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {canExportData ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center border-l-2 border-[#D97757] pl-3">
                  <h3 className="text-[13px] font-medium tracking-tight text-zinc-800">
                    数据导出
                  </h3>
                </div>
                <ExportButton />
              </div>
            </section>
          ) : null}
          {canEditData ? (
            <section className="space-y-3">
              <div className="flex items-center border-l-2 border-[#D97757] pl-3">
                <h3 className="text-[13px] font-medium tracking-tight text-zinc-800">
                  数据修正
                </h3>
              </div>
              <DataManager
                reports={fullReports}
                defaultDate={defaultDate}
                avgPlayBySubmitter={avgPlayBySubmitter}
                dayCountBySubmitter={dayCountBySubmitter}
                avgPlayByAccount={avgPlayByAccount}
                dayCountByAccount={dayCountByAccount}
              />
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
