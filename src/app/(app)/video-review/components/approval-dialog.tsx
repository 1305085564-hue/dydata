"use client";

import { useState, useEffect } from "react";
import {
  Check,
  X,
  Loader2,
  AlertCircle,
  AlertTriangle,
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  // Selection state for batch actions and optimistic updates
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const refreshLists = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [resPending, resProcessed] = await Promise.all([
        fetch("/api/exemptions/pending"),
        fetch("/api/exemptions/processed?limit=50"),
      ]);

      if (resPending.status === 403 || resProcessed.status === 403) {
        toast.error("权限不足", { description: "您没有权限执行此操作" });
        setLoadError("权限不足，无法加载数据");
        return;
      }

      const dataPending = await resPending.json();
      const dataProcessed = await resProcessed.json();

      if (dataPending.data) setPending(dataPending.data);
      if (dataProcessed.data) setProcessed(dataProcessed.data);
      setSelectedIds(new Set());
      setOptimisticRemovedIds(new Set());
    } catch (err) {
      console.error("Failed to load exemptions lists:", err);
      setLoadError("加载待审列表失败，请检查网络");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refreshLists();
    }
  }, [open]);

  // Single review with optimistic removal
  const handleReview = async (id: string, action: "approved" | "rejected") => {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setOptimisticRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      const res = await fetch("/api/exemptions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          action,
        }),
      });

      if (res.status === 403) {
        setOptimisticRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error("权限不足", { description: "您没有权限执行此操作" });
        return;
      }

      const result = await res.json();

      if (res.ok) {
        toast.success(action === "approved" ? "已批准申请" : "已拒绝申请", {
          description: "审批状态已同步至产量看板",
        });
        await refreshLists();
        await onSubmitSuccess();
      } else {
        setOptimisticRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error("审批操作失败", {
          description: result.error || "接口错误",
        });
      }
    } catch (err) {
      setOptimisticRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error("网络错误", {
        description: "审批操作网络异常，请重试",
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Batch review with optimistic removal
  const handleBatchReview = async (action: "approved" | "rejected") => {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);

    const idsArray = Array.from(selectedIds);
    setProcessingIds((prev) => {
      const next = new Set(prev);
      idsArray.forEach((id) => next.add(id));
      return next;
    });
    setOptimisticRemovedIds((prev) => {
      const next = new Set(prev);
      idsArray.forEach((id) => next.add(id));
      return next;
    });

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

            if (res.status === 403) {
              toast.error("权限不足", { description: "您没有权限执行此操作" });
              failCount++;
              setOptimisticRemovedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              return;
            }

            if (res.ok) {
              successCount++;
            } else {
              failCount++;
              setOptimisticRemovedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }
          } catch {
            failCount++;
            setOptimisticRemovedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        })
      );

      toast.success("批量审批完成", {
        description: `成功处理 ${successCount} 条` + (failCount > 0 ? `，失败 ${failCount} 条` : ""),
      });
      await refreshLists();
      await onSubmitSuccess();
    } catch (err) {
      setOptimisticRemovedIds((prev) => {
        const next = new Set(prev);
        idsArray.forEach((id) => next.delete(id));
        return next;
      });
      toast.error("网络错误", {
        description: "批量审批网络异常，请重试",
      });
    } finally {
      setBatchProcessing(false);
      setProcessingIds((prev) => {
        const next = new Set(prev);
        idsArray.forEach((id) => next.delete(id));
        return next;
      });
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

  const visiblePending = pending.filter((item) => !optimisticRemovedIds.has(item.id));

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(visiblePending.map((item) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const allSelected = visiblePending.length > 0 && selectedIds.size === visiblePending.length;
  const someSelected = visiblePending.length > 0 && selectedIds.size > 0 && selectedIds.size < visiblePending.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: "min(860px, calc(100vw - 32px))" }} className="w-[95vw] bg-white p-4 sm:p-6 rounded-2xl border border-stone-200 overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[18px] font-medium text-stone-900">
              审批中心
            </DialogTitle>
            <span className="text-[12px] text-stone-500">
              共 <span className="font-medium tabular-nums">{pending.length}</span> 条待处理
            </span>
          </div>

          {/* 胶囊分段 Tab (石青色 #8AA8C7 选中态映射) */}
          <div className="flex gap-1.5 mt-4 border-b border-stone-100 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] font-medium transition-colors flex items-center gap-1.5",
                activeTab === "pending"
                  ? "bg-[#8AA8C7]/10 text-[#8AA8C7]"
                  : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
              )}
            >
              待处理
              {pending.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C9604D] px-1 text-[12px] font-medium text-white">
                  {pending.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] font-medium transition-colors flex items-center gap-1.5",
                activeTab === "history"
                  ? "bg-[#8AA8C7]/10 text-[#8AA8C7]"
                  : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
              )}
            >
              已审历史
              {processed.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-stone-100 px-1 text-[12px] font-medium text-stone-500">
                  {processed.length}
                </span>
              )}
            </button>
          </div>
        </DialogHeader>

        {activeTab === "pending" ? (
          <>
            {/* 批量操作控制条 */}
            {visiblePending.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-stone-100 mt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    aria-label="全选"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={handleToggleSelectAll}
                    className="rounded border-stone-300 data-[state=checked]:bg-[#8AA8C7] data-[state=checked]:border-[#8AA8C7] focus-visible:ring-[#8AA8C7]"
                  />
                  <span className="text-[12px] text-stone-500 font-medium">
                    已选中 <span className="font-medium text-stone-700">{selectedIds.size}</span> 项
                  </span>
                </div>

                {selectedIds.size > 0 && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={batchProcessing || processingIds.size > 0}
                      onClick={() => handleBatchReview("rejected")}
                      className="h-8 rounded-lg text-stone-500 hover:text-[#C9604D] hover:bg-[#C9604D]/5 text-[12px]"
                    >
                      批量拒绝
                    </Button>
                    <Button
                      type="button"
                      disabled={batchProcessing || processingIds.size > 0}
                      onClick={() => handleBatchReview("approved")}
                      className="h-8 rounded-lg bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20 text-[12px] font-medium active:scale-95 transition-transform"
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
            <div className="mt-2 space-y-0">
              {loadError ? (
                <div className="flex h-48 flex-col items-center justify-center text-[12px] text-stone-500">
                  <AlertTriangle className="size-8 text-[#D97757] mb-1.5" />
                  <span>{loadError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={refreshLists}
                    className="mt-3 h-8 rounded-lg border-[#D97757] text-[#D97757] hover:bg-[#D97757]/5 text-[12px] font-medium"
                  >
                    重新加载
                  </Button>
                </div>
              ) : loading && pending.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-stone-500" />
                </div>
              ) : visiblePending.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-[12px] text-stone-500">
                  <CheckCircle2 className="size-8 text-[#6FAA7D] mb-1.5 stroke-[1.5]" />
                  太棒了！所有请假申请已审批完毕
                </div>
              ) : (
                visiblePending.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isProcessing = processingIds.has(item.id);
                  
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-3 py-4 border-b border-stone-100 transition-all duration-200 px-1 hover:bg-stone-50/20",
                        isSelected && "bg-[#8AA8C7]/10",
                        isProcessing && "opacity-40 scale-[0.98]"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        aria-label={`选择 ${item.applicant_name}`}
                        onCheckedChange={(checked) => handleToggleSelect(item.id, Boolean(checked))}
                        className="mt-1 rounded border-stone-300 data-[state=checked]:bg-[#8AA8C7] data-[state=checked]:border-[#8AA8C7] focus-visible:ring-[#8AA8C7]"
                      />

                      <div className="min-w-0 flex-1 space-y-1.5">
                        {/* 头信息 */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                          <span className="font-medium text-stone-700">
                            {item.applicant_name}
                          </span>
                          <span className="text-stone-500">|</span>
                          <span className="text-stone-500">
                            {item.group_name || item.team_name || "未分类小组"}
                          </span>
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-500">
                            {EXEMPTION_LABELS[item.exemption_type] || item.exemption_type}
                          </span>
                        </div>

                        {/* 申请日期 */}
                        <div className="flex items-center gap-1.5 text-[12px] text-stone-500">
                          <CalendarDays className="size-3.5" />
                          <span className="">{item.start_date}</span>
                          {item.end_date && (
                            <>
                              <span>至</span>
                              <span className="">{item.end_date}</span>
                            </>
                          )}
                        </div>

                        {/* 原因内容 */}
                        <p className="text-[13px] text-stone-700 leading-[1.5] border-l-2 border-stone-200 pl-3">
                          原因：{item.reason}
                        </p>
                      </div>

                      {/* 单条审批操作 */}
                      <div className="flex gap-1.5 shrink-0 self-center ml-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={processingIds.size > 0 || batchProcessing}
                          onClick={() => handleReview(item.id, "rejected")}
                          className="h-8 rounded-lg text-stone-500 hover:text-[#C9604D] hover:bg-[#C9604D]/5 text-[12px] px-2.5"
                        >
                          拒绝
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={processingIds.size > 0 || batchProcessing}
                          onClick={() => handleReview(item.id, "approved")}
                          className="h-8 rounded-lg bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20 text-[12px] px-2.5 active:scale-95 font-medium"
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
          </>
        ) : (
          <div className="mt-4">
            {processed.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <CheckCircle2 className="size-10 text-stone-500 mb-3" />
                <p className="text-[13px] text-stone-500 mb-4">暂无历史审批处理记录</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("pending")}
                  className="h-9 px-4 rounded-lg bg-[#D97757] text-[13px] font-medium text-white hover:bg-[#C96442] active:scale-95 transition-all"
                >
                  查看待处理申请
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {processed.map((item) => (
                  <div
                    key={item.id}
                    className="border-b border-stone-100 pb-3 last:border-0 text-[12px] leading-[1.6]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-stone-700">
                          {item.applicant_name}
                        </span>
                        <span className="text-stone-500">|</span>
                        <span className="text-stone-500">
                          {EXEMPTION_LABELS[item.exemption_type] || item.exemption_type}
                        </span>
                      </div>
                      
                      {item.request_status === "approved" ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#6FAA7D]/10 px-2 py-0.5 text-[12px] font-medium text-[#6FAA7D]">
                          已通过
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#C9604D]/10 px-2 py-0.5 text-[12px] font-medium text-[#C9604D]">
                          已拒绝
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-1 flex items-center gap-2 text-stone-500 text-[12px]">
                      <span>期限: <span className="">{item.start_date}</span></span>
                      {item.end_date && (
                        <>
                          <span>至</span>
                          <span className="">{item.end_date}</span>
                        </>
                      )}
                    </div>
                    
                    <p className="mt-1 text-stone-500 border-l-2 border-stone-200 pl-3">
                      原因：{item.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
