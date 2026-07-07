"use client";

import { useState, useEffect } from "react";
import {
  Check,
  X,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ExemptionRequest {
  id: string;
  applicant_user_id: string;
  applicant_name: string | null;
  team_id: string | null;
  team_name: string | null;
  group_id: string | null;
  group_name: string | null;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string;
  request_status: "pending" | "approved" | "rejected";
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitSuccess: () => Promise<void>;
}

const EXEMPTION_LABELS: Record<string, string> = {
  single: "请假1天",
  yesterday: "补昨日请假",
  "3days": "请假3天",
  "4days": "请假4天",
  "5days": "请假5天",
  range: "自定义范围",
  permanent: "永久豁免",
};

export function ApprovalDialog({
  open,
  onOpenChange,
  onSubmitSuccess,
}: ApprovalDialogProps) {
  const [pending, setPending] = useState<ExemptionRequest[]>([]);
  const [processed, setProcessed] = useState<ExemptionRequest[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Selection state for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const refreshLists = async () => {
    setLoading(true);
    try {
      const [resPending, resProcessed] = await Promise.all([
        fetch("/api/exemptions/pending"),
        fetch("/api/exemptions/processed?limit=50"),
      ]);

      const dataPending = await resPending.json();
      const dataProcessed = await resProcessed.json();

      if (dataPending.data) setPending(dataPending.data);
      if (dataProcessed.data) setProcessed(dataProcessed.data);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to load exemptions lists:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refreshLists();
    }
  }, [open]);

  // Single review
  const handleReview = async (id: string, action: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      const res = await fetch("/api/exemptions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          action,
        }),
      });
      const result = await res.json();

      if (res.ok) {
        toast.success(action === "approved" ? "已批准申请" : "已拒绝申请", {
          description: "审批状态已同步至产量看板",
        });
        await refreshLists();
        await onSubmitSuccess();
      } else {
        toast.error("审批操作失败", {
          description: result.error || "接口错误",
        });
      }
    } catch (err) {
      toast.error("网络错误", {
        description: "审批操作网络异常，请重试",
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Batch review using Promise.all parallel execution
  const handleBatchReview = async (action: "approved" | "rejected") => {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);

    const idsArray = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(
        idsArray.map(async (id) => {
          try {
            const res = await fetch("/api/exemptions/review", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                request_id: id,
                action,
              }),
            });
            if (res.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
        })
      );

      toast.success("批量审批完成", {
        description: `成功处理 ${successCount} 条` + (failCount > 0 ? `，失败 ${failCount} 条` : ""),
      });
      await refreshLists();
      await onSubmitSuccess();
    } catch (err) {
      toast.error("网络错误", {
        description: "批量审批网络异常，请重试",
      });
    } finally {
      setBatchProcessing(false);
    }
  };

  // Selection helpers
  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(pending.map((item) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const allSelected = pending.length > 0 && selectedIds.size === pending.length;
  const someSelected = pending.length > 0 && selectedIds.size > 0 && selectedIds.size < pending.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] bg-white p-6 rounded-2xl border border-stone-200 overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[16px] font-bold text-stone-800">
              审批中心 (待办消息)
            </DialogTitle>
            <span className="font-mono text-[12px] tabular-nums text-stone-400">
              共 {pending.length} 条待处理
            </span>
          </div>
        </DialogHeader>

        {/* 批量操作控制条 */}
        {pending.length > 0 && (
          <div className="flex items-center justify-between bg-stone-50/50 p-3 rounded-xl border border-stone-100 mt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                className="rounded border-stone-300 text-[#D97757] focus:ring-[#D97757]"
              />
              <span className="text-[12px] text-stone-600 font-medium">
                已选中 <span className="font-mono font-bold text-stone-800">{selectedIds.size}</span> 项
              </span>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={batchProcessing}
                  onClick={() => handleBatchReview("rejected")}
                  className="h-8 rounded-lg text-stone-500 hover:text-[#C9604D] hover:bg-[#C9604D]/5 text-[11px]"
                >
                  批量拒绝
                </Button>
                <Button
                  type="button"
                  disabled={batchProcessing}
                  onClick={() => handleBatchReview("approved")}
                  className="h-8 rounded-lg bg-[#D97757] text-white hover:bg-[#C96442] text-[11px] font-semibold active:scale-95 transition-transform"
                >
                  {batchProcessing ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : null}
                  批量同意
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 待审列表 (单边 border 分隔，不形成嵌套闭合轮廓) */}
        <div className="mt-4 space-y-0">
          {loading && pending.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-stone-400" />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-[12px] text-stone-400">
              <CheckCircle2 className="size-8 text-[#6FAA7D] mb-1.5 stroke-[1.5]" />
              太棒了！所有请假申请已审批完毕
            </div>
          ) : (
            pending.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isProcessing = processingId === item.id;
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 py-4 border-b border-stone-200 transition-colors px-1 hover:bg-stone-50/20",
                    isSelected && "bg-[#D97757]/[0.02]"
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleToggleSelect(item.id, Boolean(checked))}
                    className="mt-1 rounded border-stone-300 text-[#D97757] focus:ring-[#D97757]"
                  />

                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* 头信息 */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                      <span className="font-bold text-stone-800">
                        {item.applicant_name}
                      </span>
                      <span className="text-stone-300">|</span>
                      <span className="text-stone-500">
                        {item.group_name || item.team_name || "未分类小组"}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-stone-150 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                        {EXEMPTION_LABELS[item.exemption_type] || item.exemption_type}
                      </span>
                    </div>

                    {/* 申请日期 */}
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                      <CalendarDays className="size-3.5" />
                      <span className="font-mono">{item.start_date}</span>
                      {item.end_date && (
                        <>
                          <span>至</span>
                          <span className="font-mono">{item.end_date}</span>
                        </>
                      )}
                    </div>

                    {/* 原因内容 */}
                    <p className="text-[12.5px] text-stone-700 leading-[1.5] bg-stone-50 p-2 rounded-lg border border-stone-100">
                      原因：{item.reason}
                    </p>
                  </div>

                  {/* 单条审批操作 */}
                  <div className="flex gap-1.5 shrink-0 self-center ml-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isProcessing || batchProcessing}
                      onClick={() => handleReview(item.id, "rejected")}
                      className="h-8 rounded-lg text-stone-500 hover:text-[#C9604D] hover:bg-[#C9604D]/5 text-[11px] px-2.5"
                    >
                      拒绝
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isProcessing || batchProcessing}
                      onClick={() => handleReview(item.id, "approved")}
                      className="h-8 rounded-lg bg-stone-100 text-stone-700 hover:bg-[#6FAA7D]/10 hover:text-[#6FAA7D] text-[11px] font-medium px-2.5 active:scale-95"
                    >
                      {isProcessing ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "同意"
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部折叠式已审批历史记录 (默认收起) */}
        <div className="border-t border-stone-100 pt-4 mt-6">
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-between w-full text-[13px] font-bold text-stone-800 hover:text-stone-900 focus:outline-none"
              >
                <span>已审批记录历史 ({processed.length})</span>
                {historyOpen ? (
                  <ChevronUp className="size-4 text-stone-500" />
                ) : (
                  <ChevronDown className="size-4 text-stone-500" />
                )}
              </button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="mt-3">
              {processed.length === 0 ? (
                <p className="text-[12px] text-stone-400 text-center py-4">
                  暂无历史审批处理记录
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {processed.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-stone-150 p-3 bg-stone-50/20 text-[12px] leading-[1.6]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-stone-700">
                            {item.applicant_name}
                          </span>
                          <span className="text-stone-300">|</span>
                          <span className="text-stone-500">
                            {EXEMPTION_LABELS[item.exemption_type] || item.exemption_type}
                          </span>
                        </div>
                        
                        {item.request_status === "approved" ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#6FAA7D]/10 px-2 py-0.5 text-[10px] font-medium text-[#6FAA7D]">
                            已通过
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#C9604D]/10 px-2 py-0.5 text-[10px] font-medium text-[#C9604D]">
                            已拒绝
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-1 flex items-center gap-2 text-stone-400 text-[11px] font-mono">
                        <span>期限: {item.start_date}</span>
                        {item.end_date && (
                          <>
                            <span>至</span>
                            <span>{item.end_date}</span>
                          </>
                        )}
                      </div>
                      
                      <p className="mt-1 text-stone-500 bg-white/50 p-1.5 rounded border border-stone-100">
                        原因：{item.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
