"use client";

import { useMemo, useState } from "react";
import { Search, X, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import type { WarehouseModelGroup } from "./shelf-models-dialog";
import type { AiProvider } from "../hooks/use-ai-config";

export interface ModelManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allGroups: WarehouseModelGroup[];
  providers: AiProvider[];
  onToggleShelf: (modelId: string, nextState: boolean) => Promise<{ ok: boolean; error?: string }>;
  onDeleteModelPermanent?: (group: WarehouseModelGroup) => Promise<void>;
}

export function ModelManagerDialog({
  open,
  onOpenChange,
  allGroups,
  providers,
  onToggleShelf,
  onDeleteModelPermanent,
}: ModelManagerDialogProps) {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<WarehouseModelGroup | null>(null);

  const activeCount = useMemo(() => allGroups.filter((g) => g.isShelved).length, [allGroups]);
  const inactiveCount = allGroups.length - activeCount;

  const filteredGroups = useMemo(() => {
    let list = allGroups;

    // 状态过滤
    if (statusFilter === "active") {
      list = list.filter((g) => g.isShelved);
    } else if (statusFilter === "inactive") {
      list = list.filter((g) => !g.isShelved);
    }

    // 搜索过滤
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (g) => g.displayName.toLowerCase().includes(q) || g.modelId.toLowerCase().includes(q)
      );
    }

    // 服务商过滤
    if (providerFilter) {
      list = list.filter((g) => g.items.some((it) => it.providerName === providerFilter));
    }

    // 排序：现役在册优先，其次按支持渠道数降序
    return [...list].sort((a, b) => {
      if (a.isShelved !== b.isShelved) return a.isShelved ? -1 : 1;
      return b.items.length - a.items.length;
    });
  }, [allGroups, statusFilter, search, providerFilter]);

  const handleToggle = async (group: WarehouseModelGroup) => {
    setTogglingModelId(group.modelId);
    try {
      const nextState = !group.isShelved;
      const res = await onToggleShelf(group.modelId, nextState);
      if (!res.ok) {
        feedbackToast.error(res.error || (nextState ? "上架失败" : "下架失败"));
        return;
      }
      feedbackToast.success(nextState ? `已开启上架【${group.displayName}】` : `已下架收回【${group.displayName}】`);
    } finally {
      setTogglingModelId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmGroup || !onDeleteModelPermanent) return;
    const target = confirmGroup;
    setConfirmGroup(null);
    await onDeleteModelPermanent(target);
    feedbackToast.success(`已彻底删除模型【${target.displayName}】`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[720px] max-h-[90vh] w-[960px] max-w-[95vw] sm:max-w-[960px] flex-col rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog gap-3">
          <DialogHeader className="gap-1 border-b border-[#E2E2DF]/60 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-[18px] font-medium text-[#141413]">模型管理与上下架</DialogTitle>
                <p className="mt-0.5 text-[12px] text-[#78716C]">
                  控制全站模型现役在册状态。现役模型可被业务路由调度，储备模型保留渠道配置暂不上架。
                </p>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="flex min-h-[440px] flex-1 flex-col overflow-hidden p-0 space-y-3">
            {/* 一体化横向工具栏 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* 状态快捷切换 */}
              <div className="inline-flex items-center p-0.5 rounded-md bg-[#F1F1F0] text-[12px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  aria-pressed={statusFilter === "all"}
                  className={cn(
                    "px-3 py-1 rounded-md transition-colors text-[12px]",
                    statusFilter === "all"
                      ? "bg-white font-medium text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413]"
                  )}
                >
                  全部 ({allGroups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  aria-pressed={statusFilter === "active"}
                  className={cn(
                    "px-3 py-1 rounded-md transition-colors text-[12px]",
                    statusFilter === "active"
                      ? "bg-white font-medium text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413]"
                  )}
                >
                  现役在册 ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("inactive")}
                  aria-pressed={statusFilter === "inactive"}
                  className={cn(
                    "px-3 py-1 rounded-md transition-colors text-[12px]",
                    statusFilter === "inactive"
                      ? "bg-white font-medium text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413]"
                  )}
                >
                  储备待开启 ({inactiveCount})
                </button>
              </div>

              {/* 搜索与服务商下拉 */}
              <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索模型名称或标识..."
                    className="h-8 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#141413]"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                <div className="shrink-0">
                  <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v ?? "")}>
                    <SelectTrigger size="sm" aria-label="按渠道筛选" className="h-8 text-[12px] border-[#E2E2DF]">
                      <SelectValue placeholder="全部渠道" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部渠道</SelectItem>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 模型列表：双列网格排布 */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-[#E2E2DF] bg-[#F7F7F6]/40 p-2.5 grid grid-cols-2 gap-2.5 content-start">
              {filteredGroups.length === 0 ? (
                <div className="col-span-2 py-16 flex items-center justify-center">
                  <EmptyState
                    variant="compact"
                    title="没有找到匹配的模型"
                    description="可尝试重置搜索关键词或切换状态筛选"
                  />
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isBusy = togglingModelId === group.modelId;
                  const channelDescriptions = group.items.map((it) => {
                    const groupLabel = it.key?.label;
                    return groupLabel ? `${it.providerName} · ${groupLabel}` : it.providerName;
                  });
                  const uniqueChannelNames = Array.from(new Set(channelDescriptions)).join("、");

                  return (
                    <div
                      key={group.modelId}
                      className={cn(
                        "group relative flex flex-col justify-center rounded-xl border border-[#E2E2DF] bg-white px-3.5 py-3 transition-colors hover:bg-[#F7F7F6]/80 shadow-card",
                        isBusy && "opacity-50 pointer-events-none"
                      )}
                    >
                      <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {/* 方案 A（2026-10-04 阿禅拍板）：ui/checkbox.tsx 的全站契约是黑底白勾，
                              此处为高密卡片列表的专属例外——通透白底＋深墨框线＋深墨对勾。
                              勿删 data-checked:* 三项；如需改动，先确认拍板口径是否变更。 */}
                          <Checkbox
                            checked={group.isShelved}
                            onCheckedChange={() => handleToggle(group)}
                            className="mt-0.5 size-4 shrink-0 data-checked:border-[#141413] data-checked:bg-white data-checked:text-[#141413]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-medium text-[#141413] truncate">
                                {group.displayName}
                              </span>
                            </div>
                            <div className="text-[12px] font-mono text-[#78716C] truncate mt-0.5">
                              {group.modelId}
                            </div>
                            <div
                              className="text-[12px] text-[#78716C] truncate mt-1 flex items-center gap-1"
                              title={`支持渠道与专线: ${uniqueChannelNames}`}
                            >
                              <span className="text-[#A8A29E] shrink-0">{group.items.length} 个专线供给:</span>
                              <span className="text-[#1F1E1D] font-mono truncate">{uniqueChannelNames}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          {group.isShelved ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-normal bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20">
                              现役中
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-normal bg-[#EBEBE9] text-[#78716C]">
                                储备中
                              </span>
                              {onDeleteModelPermanent && (
                                <Button
                                  size="icon-s"
                                  variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-[#78716C] hover:text-[#C0685C] hover:bg-[#C0685C]/10 transition-opacity size-6"
                                  title="彻底删除模型记录"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmGroup(group);
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </DialogBody>

          <DialogFooter className="flex flex-row items-center justify-between border-t border-[#E2E2DF]/60 pt-3 px-1">
            <span className="text-[12px] text-[#78716C]">
              勾选即参与现役业务调度，取消勾选即收回储备仓库（保留配置）
            </span>
            <Button
              size="s"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 彻底删除模型二次确认弹窗 */}
      <Dialog open={Boolean(confirmGroup)} onOpenChange={(open) => !open && setConfirmGroup(null)}>
        <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader className="gap-1 border-b border-[#E2E2DF]/60 pb-3">
            <DialogTitle className="text-[18px] font-medium text-[#141413]">彻底删除模型确认</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3 py-2">
            <p className="text-[13px] text-[#1F1E1D]">确定要彻底删除模型「{confirmGroup?.displayName}」吗？</p>
            <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/8 p-3 text-[12px] text-[#C0685C] leading-relaxed">
              此操作将清除其在 {confirmGroup?.items.length} 个渠道专线中的全部关联记录，此操作不可撤销。
            </div>
          </DialogBody>
          <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
            <Button
              variant="outline"
              size="s"
              onClick={() => setConfirmGroup(null)}
              className="h-7 text-[12px] border-[#E2E2DF]"
            >
              取消
            </Button>
            <Button
              size="s"
              onClick={handleConfirmDelete}
              className="h-7 text-[12px] bg-[#C0685C] hover:bg-[#C0685C]/90 text-white font-normal"
            >
              确认彻底删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
