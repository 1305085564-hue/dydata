"use client";

import { useMemo, useState } from "react";
import { Search, X, Boxes, Trash2, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
        <DialogContent className="w-[780px] max-w-[95vw] sm:max-w-[780px] max-h-[85vh] flex flex-col p-6 gap-4">
          <DialogHeader className="border-b border-[#E2E2DF] pb-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-[18px] font-medium text-[#141413]">模型管理</DialogTitle>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] bg-[#F1F1F0] text-[#78716C] font-normal">
                  {activeCount} / {allGroups.length} 现役在册
                </span>
              </div>
            </div>
            <p className="text-[12px] text-[#78716C]">
              集中管理全池大模型上架状态。勾选即进入现役调度，取消勾选收回储备仓库。
            </p>
          </DialogHeader>

          <DialogBody className="space-y-3 p-0 overflow-hidden flex flex-col flex-1 min-h-[360px]">
            {/* 一体化横向工具栏 */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* 状态快捷切换 */}
              <div className="inline-flex items-center p-0.5 rounded-md bg-[#F1F1F0] text-[12px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-[5px] transition-colors",
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
                  className={cn(
                    "px-2.5 py-1 rounded-[5px] transition-colors",
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
                  className={cn(
                    "px-2.5 py-1 rounded-[5px] transition-colors",
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
                <div className="relative min-w-[180px] flex-1 sm:flex-initial">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索模型名称或标识..."
                    className="h-7 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] w-full focus-visible:ring-1 focus-visible:ring-[#D97757]"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#141413]"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                <div className="relative shrink-0">
                  <select
                    value={providerFilter}
                    onChange={(e) => setProviderFilter(e.target.value)}
                    className="h-7 appearance-none rounded-md border border-[#E2E2DF] bg-white pl-2.5 pr-7 text-[12px] text-[#1F1E1D] shadow-input outline-none hover:bg-[#F7F7F6] focus-visible:ring-1 focus-visible:ring-[#D97757] transition-colors cursor-pointer"
                  >
                    <option value="">全部服务商</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-[#78716C] pointer-events-none" />
                </div>
              </div>
            </div>

            {/* 模型列表 */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white">
              {filteredGroups.length === 0 ? (
                <div className="py-16 text-center text-[12px] text-[#A8A29E] space-y-1">
                  <Boxes className="size-6 text-[#A8A29E]/60 mx-auto mb-1" />
                  <p className="text-[#141413] font-medium">没有找到匹配的模型</p>
                  <p className="text-[11px] text-[#78716C]">可尝试重置搜索关键词或切换状态筛选</p>
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isBusy = togglingModelId === group.modelId;
                  const uniqueProviders = Array.from(
                    new Set(group.items.map((it) => it.providerName))
                  );

                  return (
                    <div
                      key={group.modelId}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[#F7F7F6]/60 transition-colors",
                        isBusy && "opacity-50 pointer-events-none"
                      )}
                    >
                      <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none">
                        <Checkbox
                          checked={group.isShelved}
                          onCheckedChange={() => handleToggle(group)}
                          className="size-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-[13px] truncate",
                                group.isShelved ? "font-medium text-[#141413]" : "text-[#78716C]"
                              )}
                            >
                              {group.displayName}
                            </span>
                            {group.displayName !== group.modelId && (
                              <span className="text-[12px] font-mono text-[#A8A29E] truncate">
                                {group.modelId}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[12px] text-[#78716C]">
                            <span className="shrink-0">{group.items.length} 个渠道支持：</span>
                            <div className="flex flex-wrap items-center gap-1">
                              {uniqueProviders.slice(0, 4).map((pName) => (
                                <span
                                  key={pName}
                                  className="inline-flex items-center px-1.5 py-0.2 rounded bg-[#F1F1F0] text-[#78716C] text-[11px]"
                                >
                                  {pName}
                                </span>
                              ))}
                              {uniqueProviders.length > 4 && (
                                <span className="text-[11px] text-[#A8A29E]">
                                  +{uniqueProviders.length - 4}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {group.isShelved && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20">
                            现役中
                          </span>
                        )}
                        {!group.isShelved && onDeleteModelPermanent && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-[#A8A29E] hover:text-[#C0685C] hover:bg-[#C0685C]/10 transition-colors"
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
                    </div>
                  );
                })
              )}
            </div>

          </DialogBody>

          <DialogFooter className="flex flex-row items-center justify-between border-t border-[#E2E2DF] pt-3 px-1">
            <div className="text-[12px] text-[#78716C]">
              已开启 <span className="font-medium text-[#141413]">{activeCount}</span> 个现役在册模型
            </div>
            <Button
              size="s"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-7 px-4 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 彻底删除模型二次确认弹窗 */}
      <Dialog open={Boolean(confirmGroup)} onOpenChange={(open) => !open && setConfirmGroup(null)}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px] text-[#141413]">彻底删除模型确认</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2 py-2">
            <p className="text-[13px] text-[#1F1E1D]">确定要彻底删除模型「{confirmGroup?.displayName}」吗？</p>
            <p className="text-[12px] text-[#C0685C] bg-[#C0685C]/8 p-2.5 rounded-md border border-[#C0685C]/20">
              此操作将清除其在 {confirmGroup?.items.length} 个渠道的关联记录。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="s" onClick={() => setConfirmGroup(null)} className="h-7 text-[12px]">取消</Button>
            <Button size="s" onClick={handleConfirmDelete} className="h-7 text-[12px] bg-[#C0685C] hover:bg-[#C0685C]/90 text-white font-normal">
              确认彻底删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
