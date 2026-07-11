"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataManager } from "./data-manager";
import { ExportButton } from "./export-button";
import type { AdminGovernanceData } from "@/lib/loaders/admin-modules";
import { feedbackToast } from "@/components/ui/feedback-toast";

interface GovernanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canExportData: boolean;
  canEditData: boolean;
  defaultDate: string;
}

export function GovernanceDialog({
  open,
  onOpenChange,
  canExportData,
  canEditData,
  defaultDate,
}: GovernanceDialogProps) {
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [data, setData] = useState<AdminGovernanceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSelectedDate(defaultDate);
  }, [defaultDate]);

  useEffect(() => {
    if (!open || !canEditData) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/admin/modules/governance?date=${encodeURIComponent(selectedDate)}`);
        const payload = (await response.json()) as AdminGovernanceData & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "加载数据管理失败");
        }
        if (cancelled) return;

        setData(payload);
      } catch (error) {
        if (cancelled) return;
        setData(null);
        feedbackToast.error(error instanceof Error ? error.message : "加载数据管理失败");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, canEditData, selectedDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[768px] !max-w-[calc(100vw-2rem)] h-[384px] rounded-2xl border border-stone-200 bg-white p-0 flex flex-col">
        <DialogHeader className="border-b border-stone-200 px-6 py-4 shrink-0">
          <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-900">
            数据管理
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {canExportData ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center border-l-2 border-[#D97757] pl-3">
                  <h3 className="text-[13px] font-medium tracking-tight text-stone-900">
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
                <h3 className="text-[13px] font-medium tracking-tight text-stone-900">
                  数据修正
                </h3>
              </div>
              {isLoading ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-[13px] text-stone-500">
                  正在加载当日数据…
                </div>
              ) : data ? (
                <DataManager
                  reports={data.fullReports}
                  defaultDate={data.queryDate}
                  avgPlayBySubmitter={data.avgPlayBySubmitter}
                  dayCountBySubmitter={data.dayCountBySubmitter}
                  avgPlayByAccount={data.avgPlayByAccount}
                  dayCountByAccount={data.dayCountByAccount}
                  onDateChange={setSelectedDate}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-[13px] text-stone-500">
                  当前日期没有可用数据。
                </div>
              )}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
