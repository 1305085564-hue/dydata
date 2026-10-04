"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
import type { ModelFamilyKeyItem } from "./model-family-card";
import type { AiProvider } from "../hooks/use-ai-config";

export interface DiscoveredModelItem {
  modelId: string;
  displayName: string;
}

export type WarehouseModelGroup = {
  modelId: string;
  displayName: string;
  items: ModelFamilyKeyItem[];
  isShelved: boolean;
};

export type KeyTestResultItem = {
  keyId: string;
  keyName: string;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

interface ShelfModelsPickerProps {
  activeInheritedModels: DiscoveredModelItem[];
  otherDiscoveredModels: DiscoveredModelItem[];
  selectedModelIds: Set<string>;
  onToggleModel: (modelId: string) => void;
  isProbeSuccess?: boolean;
}

export function ShelfModelsPicker({
  activeInheritedModels,
  otherDiscoveredModels,
  selectedModelIds,
  onToggleModel,
  isProbeSuccess = true,
}: ShelfModelsPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeInheritedModels;
    return activeInheritedModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q)
    );
  }, [activeInheritedModels, searchQuery]);

  const filteredOther = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return otherDiscoveredModels;
    return otherDiscoveredModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q)
    );
  }, [otherDiscoveredModels, searchQuery]);

  return (
    <div className="space-y-4">
      {/* 顶部搜索框（过滤全部发现模型） */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索模型名称或 ID..."
          className="h-7 pl-8 text-[12px] border-[#E2E2DF] text-[#1F1E1D] focus-visible:ring-1 focus-visible:ring-[#D97757]"
        />
      </div>

      {/* 区一：全站现役模型 · 自动继承上架 */}
      <div className="space-y-2 rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#141413]">
            全站现役模型 · 自动继承上架 ({activeInheritedModels.length})
          </span>
        </div>
        <p className="text-[12px] leading-relaxed text-[#78716C]">
          {isProbeSuccess
            ? "检测到此密钥支持网站正在使用的模型，已默认勾选，接入后自动作为备用算力源。"
            : "网站当前正在使用的现役模型，已默认勾选，接入后作为备用算力源。"}
        </p>

        {filteredActive.length === 0 ? (
          <div className="py-2 text-center text-[12px] text-[#A8A29E]">
            {searchQuery ? "未找到匹配的现役模型" : "暂无可自动继承的现役模型"}
          </div>
        ) : (
          <div className="divide-y divide-[#E2E2DF]/60 max-h-36 overflow-y-auto rounded-md border border-[#E2E2DF] bg-white">
            {filteredActive.map((item) => {
              const isChecked = selectedModelIds.has(item.modelId);
              return (
                <label
                  key={item.modelId}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-[#F7F7F6] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => onToggleModel(item.modelId)}
                    />
                    <span className="text-[13px] font-normal text-[#1F1E1D] truncate">
                      {item.displayName}
                    </span>
                    {item.displayName !== item.modelId && (
                      <span className="text-[12px] font-mono text-[#78716C] truncate">
                        ({item.modelId})
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-medium bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20 shrink-0">
                    全站使用中
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 区二：该渠道支持的其他模型 / 回退候选 */}
      <div className="space-y-2 rounded-xl border border-[#E2E2DF] bg-white p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#141413]">
            {isProbeSuccess
              ? `该渠道支持的其他模型 (${otherDiscoveredModels.length})`
              : `未探测到上游模型 · 历史已知模型候选 (${otherDiscoveredModels.length})`}
          </span>
          <span className="text-[12px] text-[#78716C]">
            {isProbeSuccess ? "未勾选将仅存入仓库待用" : "未直接探测到上游渠道，以下为历史候选"}
          </span>
        </div>

        {filteredOther.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-[#A8A29E]">
            {searchQuery ? "未找到匹配的其他模型" : "未发现其他未上架模型"}
          </div>
        ) : (
          <div className="divide-y divide-[#E2E2DF]/60 max-h-48 overflow-y-auto rounded-md border border-[#E2E2DF] bg-white">
            {filteredOther.map((item) => {
              const isChecked = selectedModelIds.has(item.modelId);
              return (
                <label
                  key={item.modelId}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-[#F7F7F6] cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => onToggleModel(item.modelId)}
                    />
                    <span
                      className={`text-[13px] font-normal truncate ${
                        isChecked ? "text-[#1F1E1D]" : "text-[#78716C]"
                      }`}
                    >
                      {item.displayName}
                    </span>
                    {item.displayName !== item.modelId && (
                      <span className="text-[12px] font-mono text-[#A8A29E] truncate">
                        ({item.modelId})
                      </span>
                    )}
                  </div>
                  {isChecked && (
                    <span className="text-[12px] text-[#D97757] shrink-0 font-medium">
                      接入后上架
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<WarehouseModelGroup | null>(null);

  const filteredGroups = useMemo(() => {
    let list = allGroups;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (g) => g.displayName.toLowerCase().includes(q) || g.modelId.toLowerCase().includes(q)
      );
    }
    if (providerFilter) {
      list = list.filter((g) => g.items.some((it) => it.providerName === providerFilter));
    }
    // 开启中的排在前面，其次按支持渠道数降序
    return [...list].sort((a, b) => {
      if (a.isShelved !== b.isShelved) return a.isShelved ? -1 : 1;
      return b.items.length - a.items.length;
    });
  }, [allGroups, search, providerFilter]);

  const activeCount = useMemo(() => allGroups.filter((g) => g.isShelved).length, [allGroups]);

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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="border-b border-[#E2E2DF] pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-serif text-[18px] text-[#141413]">模型管理</DialogTitle>
              <span className="text-[12px] text-[#78716C]">
                已开启 <span className="font-medium text-[#141413]">{activeCount}</span> / 全池共 {allGroups.length} 个模型
              </span>
            </div>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              从全池渠道中挑选并开启现役在册模型。勾选开启上架，取消勾选下架收回。
            </p>
          </DialogHeader>

          <DialogBody className="space-y-3 py-3 overflow-hidden flex flex-col flex-1">
            {/* 搜索与来源渠道筛选 */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索模型名称或标识..."
                    className="h-7 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#141413]">
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#78716C] shrink-0">来源渠道：</span>
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  className="h-7 rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] text-[#141413] shadow-input outline-none"
                >
                  <option value="">全部服务商</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 模型列表 */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white">
              {filteredGroups.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-[#A8A29E]">
                  没有找到匹配的模型
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isBusy = togglingModelId === group.modelId;
                  return (
                    <div
                      key={group.modelId}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-[#F7F7F6]/60 transition-colors",
                        isBusy && "opacity-50 pointer-events-none"
                      )}
                    >
                      <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                        <Checkbox
                          checked={group.isShelved}
                          onCheckedChange={() => handleToggle(group)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[13px] truncate", group.isShelved ? "font-medium text-[#141413]" : "text-[#78716C]")}>
                              {group.displayName}
                            </span>
                            <span className="text-[12px] font-mono text-[#A8A29E] truncate">
                              ({group.modelId})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-[#78716C] truncate">
                            <span>{group.items.length} 渠道：</span>
                            <span className="truncate">{group.items.map((it) => it.providerName).join("、")}</span>
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        {group.isShelved ? (
                          <span className="text-[12px] px-2 py-0.5 rounded-md bg-[#6FAA7D]/10 text-[#6FAA7D] font-medium border border-[#6FAA7D]/20">
                            已开启
                          </span>
                        ) : (
                          <span className="text-[12px] px-2 py-0.5 rounded-md bg-[#EBEBE9] text-[#78716C]">
                            未开启
                          </span>
                        )}
                        {!group.isShelved && onDeleteModelPermanent && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 text-[#78716C] hover:text-[#C0685C]"
                            title="彻底删除模型记录"
                            onClick={() => setConfirmGroup(group)}
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogBody>

          <DialogFooter className="border-t border-[#E2E2DF] pt-3">
            <Button size="s" variant="outline" onClick={() => onOpenChange(false)} className="h-7 text-[12px] border-[#E2E2DF]">
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 彻底删除模型二次确认弹窗 */}
      <Dialog open={Boolean(confirmGroup)} onOpenChange={(open) => !open && setConfirmGroup(null)}>
        <DialogContent className="max-w-md">
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

interface KeyTestResultsBarProps {
  testResults: { total: number; results: KeyTestResultItem[] };
  onClose: () => void;
}

export function KeyTestResultsBar({ testResults, onClose }: KeyTestResultsBarProps) {
  return (
    <div className="rounded-xl border border-[#E2E2DF] bg-white p-3 shadow-input space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-[#141413]">
          <span className="font-medium">渠道连通测试结果</span>
          <span className="text-[#78716C]">
            ({testResults.results.filter((r) => r.ok).length}/{testResults.total} 在线)
          </span>
        </div>
        <button onClick={onClose} className="text-[#78716C] hover:text-[#1F1E1D] p-1 rounded-md" title="关闭结果条">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {testResults.results.map((r) => {
          const isTimeout = !r.ok && (r.error?.toLowerCase().includes("timeout") || r.error?.includes("超时"));
          return (
            <div key={r.keyId} className="flex items-center justify-between rounded-md border border-[#E2E2DF]/60 bg-[#F7F7F6]/60 px-2.5 py-1.5 text-[12px]">
              <span className="truncate max-w-[140px] text-[#141413] font-medium" title={r.keyName}>{r.keyName}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.ok ? (
                  <>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#6FAA7D]/10 text-[#6FAA7D] font-medium">在线</span>
                    <span className="text-[#78716C] font-mono">{r.latencyMs}ms</span>
                  </>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#C0685C]/10 text-[#C0685C]" title={r.error}>
                    {isTimeout ? "超时" : "失败"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SyncFailedResultsBarProps {
  failedChannels: Array<{ keyName: string; error: string }>;
  onClose: () => void;
}

export function SyncFailedResultsBar({ failedChannels, onClose }: SyncFailedResultsBarProps) {
  return (
    <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/5 p-3 shadow-input space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-[#C0685C]">
          <span className="font-medium">未连通渠道手记</span>
          <span>({failedChannels.length} 个渠道探测异常)</span>
        </div>
        <button onClick={onClose} className="text-[#C0685C] hover:bg-[#C0685C]/10 p-1 rounded-md" title="关闭">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {failedChannels.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2 rounded-md border border-[#C0685C]/20 bg-white px-2.5 py-1.5 text-[12px]">
            <span className="text-[#141413] font-medium shrink-0 max-w-[140px] truncate" title={item.keyName}>
              {item.keyName}
            </span>
            <span className="text-[#C0685C] text-right truncate text-[12px]" title={item.error}>
              {item.error || "探测失败"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
