"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { useAiConfig } from "../hooks/use-ai-config";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { sortSyncGroups } from "@/lib/ai-config/list-order";

export interface SyncModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
  keyLabel: string;
}

interface ModelGroupItem {
  displayName: string;
  recommendedModelId: string;
  modelIds: string[];
}

export function SyncModelsDialog({
  open,
  onOpenChange,
  keyId,
  keyLabel,
}: SyncModelsDialogProps) {
  const { bundle, runCommand } = useAiConfig();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 同步结果数据
  const [modelGroups, setModelGroups] = useState<ModelGroupItem[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // S8: 上游变动对比
  const [newCount, setNewCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [removedEnabledCount, setRemovedEnabledCount] = useState(0);
  const [lostBusinesses, setLostBusinesses] = useState<Array<{ key: string; label: string; modelId?: string | null }>>([]);

  // 当前渠道正在使用的模型集合
  const currentChannelEnabledModelIds = useMemo(() => {
    if (!keyId || !bundle?.models) return new Set<string>();
    return new Set(
      bundle.models
        .filter((m: { key_id: string; is_enabled: boolean; model_id: string }) => m.key_id === keyId && m.is_enabled)
        .map((m: { model_id: string }) => m.model_id)
    );
  }, [keyId, bundle]);

  // 拉取与同步上游模型
  const handleSync = useCallback(async (targetKeyId: string) => {
    setLoading(true);
    setLoadError(null);
    setRemovedCount(0);
    setRemovedEnabledCount(0);
    setLostBusinesses([]);
    try {
      const res = await runCommand("sync_key_models", { key_id: targetKeyId });
      if (res.ok) {
        const body = res.body as {
          syncResult?: {
            allModels?: Array<{ modelId: string; isEnabled: boolean }>;
            modelGroups?: ModelGroupItem[];
            newCount?: number;
            removedCount?: number;
            removedEnabledCount?: number;
            lostBusinesses?: Array<{ key: string; label: string; modelId?: string | null }>;
          };
        };

        const result = body.syncResult;
        // 默认勾选：原本已开通的模型
        const initialSelected = new Set<string>();
        if (result?.allModels) {
          for (const m of result.allModels) {
            if (m.isEnabled) initialSelected.add(m.modelId);
          }
        }
        // 打开时排一次：本渠道在用的在上；勾选/取消时位置不变
        setModelGroups(sortSyncGroups(result?.modelGroups || [], initialSelected));
        setNewCount(result?.newCount ?? 0);
        setRemovedCount(result?.removedCount ?? 0);
        setRemovedEnabledCount(result?.removedEnabledCount ?? 0);
        setLostBusinesses(result?.lostBusinesses ?? []);
        setSelectedModelIds(initialSelected);
        if (result?.removedCount) {
          feedbackToast.success(`已与上游对齐：自动撤下 ${result.removedCount} 个上游已没有的模型`);
        }
        if (result?.lostBusinesses?.length) {
          feedbackToast.error(`有 ${result.lostBusinesses.length} 个业务因此没有可用渠道，请补充其他渠道`, { duration: 6000 });
        }
      } else {
        setLoadError(res.error || "获取上游模型失败");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "获取上游模型失败");
    } finally {
      setLoading(false);
    }
  }, [runCommand]);

  useEffect(() => {
    if (open && keyId) {
      handleSync(keyId);
      setSearchQuery("");
      setExpandedGroups(new Set());
    }
  }, [open, keyId, handleSync]);

  // 保存勾选结果（取消勾选只是关闭，不删除）
  const handleSave = async () => {
    if (!keyId) return;
    setSaving(true);
    try {
      const res = await runCommand("set_key_model_selection", {
        key_id: keyId,
        model_ids: Array.from(selectedModelIds),
      });

      if (res.ok) {
        feedbackToast.success("已保存模型配置");
        onOpenChange(false);
      } else {
        feedbackToast.error(res.error || "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  // 展开/收起更多版本
  const toggleGroupExpanded = (displayName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(displayName)) next.delete(displayName);
      else next.add(displayName);
      return next;
    });
  };

  // 勾选/取消勾选单个真实 ID
  const toggleModelSelection = (modelId: string, checked: boolean) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  };

  // 切换一组主模型的勾选
  const toggleGroupSelection = (group: ModelGroupItem, checked: boolean) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        // 推荐勾选推荐写法
        next.add(group.recommendedModelId);
      } else {
        // 取消时把组内全部取消
        for (const id of group.modelIds) {
          next.delete(id);
        }
      }
      return next;
    });
  };

  // 过滤后的模型组
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return modelGroups;
    const q = searchQuery.toLowerCase().trim();
    return modelGroups.filter(
      (g) =>
        g.displayName.toLowerCase().includes(q) ||
        g.modelIds.some((id) => id.toLowerCase().includes(q))
    );
  }, [modelGroups, searchQuery]);

  // 全选/全不选
  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      const all = new Set<string>();
      for (const g of modelGroups) {
        all.add(g.recommendedModelId);
      }
      setSelectedModelIds(all);
    } else {
      setSelectedModelIds(new Set());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog w-[94vw] sm:w-[760px] sm:max-w-[760px] max-h-[calc(100dvh-2rem)]">
        <DialogHeader className="border-b border-[#E2E2DF]/60 pb-3 shrink-0">
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-[20px] text-[#141413]">
                同步模型 · {keyLabel}
              </DialogTitle>
              <p className="mt-0.5 text-[12px] text-[#78716C]">
                拉取上游服务商支持的最新模型清单。同模型的不同写法已合并为一行。
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col space-y-3 py-3 overflow-hidden">
          {/* S8: 上游比对卡 */}
          <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-[#141413]">
                上游新增 {newCount} 个
              </span>
              <span className="text-[#78716C]">/</span>
              <span className={removedCount > 0 ? "text-[#8A6A2F]" : "text-[#78716C]"}>
                已自动撤下 {removedCount} 个
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="s"
                variant="outline"
                disabled={loading}
                onClick={() => keyId && handleSync(keyId)}
                className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
              >
                {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                重新拉取
              </Button>
            </div>
          </div>

          {/* 上游已移除的在供模型：明确告知，不留历史旧账 */}
          {removedEnabledCount > 0 && (
            <div className="text-[12px] text-[#8A6A2F]">
              其中 {removedEnabledCount} 个原本勾选在供，已随上游最新清单自动从本渠道撤下。
            </div>
          )}

          {/* 独苗保护：撤下后业务没有可用渠道，必须醒目提示补渠道 */}
          {lostBusinesses.length > 0 && (
            <div className="rounded-xl border border-status-danger/30 bg-status-danger/[0.04] p-3 text-[12px] text-status-danger-text space-y-1">
              <div className="flex items-center gap-2 font-normal">
                <AlertCircle className="size-4 shrink-0" />
                <span>以下业务因此失去了最后一条可用渠道，请补充其他渠道：</span>
              </div>
              <div className="pl-6 space-y-0.5">
                {lostBusinesses.map((business) => (
                  <div key={business.key}>
                    {business.label}{business.modelId ? `（${business.modelId}）` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 搜索与全选 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sync-select-all"
                checked={
                  selectedModelIds.size > 0 &&
                  selectedModelIds.size === modelGroups.length
                }
                onCheckedChange={(checked) => handleToggleAll(Boolean(checked))}
                className="size-4 rounded-md"
              />
              <label htmlFor="sync-select-all" className="text-[12px] text-[#1F1E1D] cursor-pointer">
                全选推荐版本 ({selectedModelIds.size} 项已选)
              </label>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索模型名称或标识..."
                className="h-8 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#141413]"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* 模型列表 */}
          <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[12px] text-[#78716C]">
              <Loader2 className="size-5 animate-spin" />
              <span>正在向服务商查询可用模型…</span>
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-status-danger/30 bg-status-danger/[0.08] p-4 text-[12px] text-status-danger-text flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-[#78716C]">
              未找到匹配的模型
            </div>
          ) : (
            <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white overflow-hidden text-[12px]">
              {filteredGroups.map((group) => {
                const isGroupExpanded = expandedGroups.has(group.displayName);
                const hasMultipleVersions = group.modelIds.length > 1;

                // 判断是否有任何一个子版本被勾选
                const isAnySelected = group.modelIds.some((id) => selectedModelIds.has(id));

                // S9: 标签只保留「在用」和「新发现」两种
                const isInUse = group.modelIds.some((id) => currentChannelEnabledModelIds.has(id));

                return (
                  <div key={group.displayName} className="p-3 space-y-2 hover:bg-[#F7F7F6]/40 transition-colors">
                    {/* 主行 */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* S9 键盘空格勾选：Checkbox 焦聚时支持键盘空格 toggle */}
                        <Checkbox
                          checked={isAnySelected}
                          onCheckedChange={(checked) => toggleGroupSelection(group, Boolean(checked))}
                          className="size-4 rounded-md shrink-0"
                          aria-label={`勾选${group.displayName}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-normal text-[14px] text-[#141413] truncate">
                              {group.displayName}
                            </span>
                            {/* S9 标签：在用 vs 新发现 */}
                            {isInUse ? (
                              <span className="rounded-md bg-[#4B6B4E]/10 px-1.5 py-0.5 text-[12px] text-[#4B6B4E]">
                                在用
                              </span>
                            ) : (
                              <span className="rounded-md bg-[#D97757]/10 px-1.5 py-0.5 text-[12px] text-[#D97757]">
                                新发现
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[12px] text-[#78716C] truncate mt-0.5">
                            推荐写法: {group.recommendedModelId}
                          </div>
                        </div>
                      </div>

                      {/* 更多版本折叠按钮 */}
                      {hasMultipleVersions && (
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(group.displayName)}
                          className="flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413] shrink-0"
                        >
                          <span>更多版本 ({group.modelIds.length})</span>
                          {isGroupExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        </button>
                      )}
                    </div>

                    {/* 口径 7: 展开展示同一模型的不同写法与变体 */}
                    {isGroupExpanded && hasMultipleVersions && (
                      <div className="mt-2 pl-6 pt-2 border-t border-[#E2E2DF]/60 space-y-1">
                        <div className="text-[12px] text-[#78716C]">可勾选具体上游标识：</div>
                        <div className="space-y-1">
                          {group.modelIds.map((id) => {
                            const isChecked = selectedModelIds.has(id);
                            const isRec = id === group.recommendedModelId;

                            return (
                              <label
                                key={id}
                                className="flex items-center justify-between p-1.5 rounded-md hover:bg-[#F1F1F0] cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => toggleModelSelection(id, Boolean(checked))}
                                    className="size-3.5 rounded-md"
                                  />
                                  <span className="font-mono text-[12px] text-[#1F1E1D] truncate">
                                    {id}
                                  </span>
                                </div>
                                {isRec && (
                                  <span className="text-[12px] text-[#8A6A2F]">推荐</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3 shrink-0 flex items-center justify-between sm:justify-between">
          <span className="text-[12px] text-[#78716C]">
            勾选后即参与渠道供给，取消勾选仅停止供应
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="s"
              onClick={() => onOpenChange(false)}
              className="h-8 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              取消
            </Button>
            <Button
              size="s"
              disabled={saving || loading}
              onClick={handleSave}
              className="h-8 px-4 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              {saving ? "保存中…" : `保存配置 (${selectedModelIds.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
