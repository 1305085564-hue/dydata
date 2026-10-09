"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  CheckCheck,
  Square,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName, resolveModelDisplayName } from "@/lib/ai/model-families";
import { ChannelModelTestList } from "./channel-model-test-list";
import { cn } from "@/lib/utils";
import {
  AI_MODEL_BATCH_TIMEOUT_MESSAGE,
  type KeyModelInventoryItem,
  type SyncKeyModelsResult,
  type KeyAllModelsTestResponse,
} from "../hooks/use-ai-config";

export type ChannelTestSummary = {
  total: number;
  successCount: number;
  failureCount: number;
  /** 本渠道每个被测模型的逐条结果，用于「每个模型一行」铺开呈现 */
  results: Array<{ modelId: string; ok: boolean; latencyMs: number | null; error: string | null }>;
};

export interface SyncModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
  keyLabel: string;
  onSync: (keyId: string) => Promise<{ ok: true; data: SyncKeyModelsResult } | { ok: false; error: string }>;
  onSave: (keyId: string, modelIds: string[]) => Promise<boolean>;
  onTestKeyAllModels: (keyId: string) => Promise<KeyAllModelsTestResponse>;
  lastTestSummary?: ChannelTestSummary | null;
  onTestSummaryChange?: (keyId: string, summary: ChannelTestSummary) => void;
}

export function SyncModelsDialog({
  open,
  onOpenChange,
  keyId,
  keyLabel,
  onSync,
  onSave,
  onTestKeyAllModels,
  lastTestSummary,
  onTestSummaryChange,
}: SyncModelsDialogProps) {
  const [inventory, setInventory] = useState<KeyModelInventoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // 渠道模型检测状态（优先读取父级持久化的结果，弹窗开关/30秒后再看依然常驻）
  const [testingChannel, setTestingChannel] = useState(false);
  const [testSummary, setTestSummary] = useState<ChannelTestSummary | null>(lastTestSummary ?? null);

  useEffect(() => {
    if (lastTestSummary !== undefined) {
      setTestSummary(lastTestSummary);
    }
  }, [lastTestSummary, keyId]);

  // 滑动选择状态控制
  const isMouseDownRef = useRef(false);
  const targetCheckedRef = useRef(true);

  // onSync 保持稳定引用，避免父组件重新渲染导致死循环
  const onSyncRef = useRef(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const inFlightKeyIdRef = useRef<string | null>(null);

  const loadData = useCallback(async (targetKeyId: string) => {
    if (inFlightKeyIdRef.current === targetKeyId) return;
    inFlightKeyIdRef.current = targetKeyId;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await onSyncRef.current(targetKeyId);
      if (!res.ok) {
        setLoadError(res.error || "拉取模型列表失败");
        return;
      }
      const models = res.data.allModels ?? [];
      setInventory(models);
      // 默认勾选：现役（isGlobalActive）或本渠道启用（isEnabled）
      const initialSelected = new Set(
        models
          .filter((m) => m.isGlobalActive || m.isEnabled)
          .map((m) => m.modelId)
      );
      setSelectedModelIds(initialSelected);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "拉取模型列表失败");
    } finally {
      inFlightKeyIdRef.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && keyId) {
      setSearchQuery("");
      isMouseDownRef.current = false;
      void loadData(keyId);
    } else if (!open) {
      inFlightKeyIdRef.current = null;
      setInventory(null);
      setLoadError(null);
    }
  }, [open, keyId, loadData]);

  // 全局监听 mouseup，确保无论鼠标滑到哪里松开都能平稳结束滑动选择
  useEffect(() => {
    const handleMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const isFirstLoading = loading && inventory === null;
  const isRefreshing = loading && inventory !== null;
  const currentInventory = useMemo(() => inventory ?? [], [inventory]);

  const filteredModels = useMemo(() => {
    if (!inventory) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        (m.displayName && m.displayName.toLowerCase().includes(q))
    );
  }, [inventory, searchQuery]);

  const handleRowMouseDown = (modelId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const isMouse = (e.nativeEvent instanceof PointerEvent)
      ? e.nativeEvent.pointerType === "mouse"
      : !("ontouchstart" in window && navigator.maxTouchPoints > 0);

    const currentlyChecked = selectedModelIds.has(modelId);
    const nextState = !currentlyChecked;

    if (isMouse) {
      targetCheckedRef.current = nextState;
      isMouseDownRef.current = true;
    }

    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (nextState) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  };

  const handleRowMouseEnter = (modelId: string) => {
    if (!isMouseDownRef.current) return;
    const nextState = targetCheckedRef.current;
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (nextState) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((m) => next.add(m.modelId));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((m) => next.delete(m.modelId));
      return next;
    });
  };

  const handleSave = async () => {
    if (!keyId) return;
    if (selectedModelIds.size === 0) {
      feedbackToast.error("至少保留一项可用型号；若暂不使用该渠道，可直接停用该渠道。");
      return;
    }

    setSaving(true);
    try {
      const ok = await onSave(keyId, Array.from(selectedModelIds));
      if (ok) {
        feedbackToast.success("已更新渠道可用型号配置");
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRunChannelTest = async () => {
    if (!keyId || testingChannel) return;
    setTestingChannel(true);
    try {
      const data = await onTestKeyAllModels(keyId);
      const results = (data.results ?? []).map((r) => ({
        modelId: r.modelId,
        ok: r.ok,
        latencyMs: r.latencyMs ?? null,
        error: r.error ?? null,
      }));
      const failures = results.filter((r) => !r.ok);
      const summary: ChannelTestSummary = {
        total: data.total ?? results.length,
        successCount: data.successCount ?? results.filter((r) => r.ok).length,
        failureCount: data.failureCount ?? failures.length,
        results,
      };
      setTestSummary(summary);
      if (keyId && onTestSummaryChange) {
        onTestSummaryChange(keyId, summary);
      }
      if (results.length === 0) {
        feedbackToast.warning("该渠道没有可检测的上架模型，未形成通过结论");
      } else if (failures.length === 0) {
        feedbackToast.success(`渠道全部模型检测通过（${data.total} 个）`);
      } else {
        feedbackToast.warning(
          `渠道模型检测完成：${data.successCount} 个通过，${failures.length} 个未通过`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message === AI_MODEL_BATCH_TIMEOUT_MESSAGE) {
        feedbackToast.error(AI_MODEL_BATCH_TIMEOUT_MESSAGE, {
          description: "检测已中断，可以继续检测。",
          action: {
            label: "继续检测",
            onClick: () => {
              void handleRunChannelTest();
            },
          },
        });
      } else {
        feedbackToast.error(err instanceof Error ? err.message : "检测异常");
      }
    } finally {
      setTestingChannel(false);
    }
  };

  const isAllFilteredSelected =
    filteredModels.length > 0 &&
    filteredModels.every((m) => selectedModelIds.has(m.modelId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[94vw] flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog sm:max-w-3xl">
        {/* 弹窗 Header：去掉接入点名，只显示渠道名称 */}
        <DialogHeader className="gap-1 border-b border-[#E2E2DF]/60 pb-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[18px] font-medium text-[#141413]">
              {keyLabel}
            </DialogTitle>
            {isRefreshing && (
              <div className="flex items-center gap-1.5 text-[12px] text-[#78716C] bg-[#F4F4F2] px-2 py-0.5 rounded-md">
                <Loader2 className="size-3 animate-spin text-[#78716C]" />
                <span>正在刷新...</span>
              </div>
            )}
          </div>
          <p className="text-[12px] text-[#78716C] leading-normal">
            管理此渠道挂载的可用模型。按住鼠标划过可批量启用或取消。
          </p>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden py-1">
          {isFirstLoading ? (
            <div className="flex flex-col items-center justify-center p-16 text-center space-y-3">
              <Loader2 className="size-6 animate-spin text-[#D97757]" />
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-[#141413]">正在拉取该渠道全部模型列表...</p>
                <p className="text-[12px] text-[#78716C]">连接上游接入点中，请稍候</p>
              </div>
            </div>
          ) : loadError && inventory === null ? (
            <div className="flex flex-col items-center justify-center p-10 text-center space-y-3">
              <div className="size-8 rounded-full bg-[#C0685C]/10 flex items-center justify-center text-[#C0685C]">
                <AlertCircle className="size-4" />
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-medium text-[#141413]">模型列表同步失败</p>
                <p className="text-[12px] text-[#78716C] max-w-md mx-auto">{loadError}</p>
              </div>
              <Button
                variant="outline"
                size="s"
                onClick={() => keyId && void loadData(keyId)}
                className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
              >
                重试
              </Button>
            </div>
          ) : (
            <>
              {loadError && (
                <div className="shrink-0 mb-2 flex items-center justify-between gap-2 rounded-lg border border-[#C0685C]/20 bg-[#C0685C]/5 px-3 py-2 text-[12px] text-[#C0685C]">
                  <span>刷新失败：{loadError}</span>
                  <button
                    type="button"
                    onClick={() => keyId && void loadData(keyId)}
                    className="font-medium underline hover:text-[#A55246] cursor-pointer"
                  >
                    重试
                  </button>
                </div>
              )}

              {/* 渠道全模型检测结果展示区（常驻显示在标题下方 / 模型列表上方） */}
              {testSummary && !testingChannel && (
                <div
                  className={cn(
                    "shrink-0 mb-2 rounded-xl border p-3 text-[12px] space-y-2 select-text transition-all",
                    testSummary.failureCount > 0
                      ? "border-[#C0685C]/25 bg-[#C0685C]/5"
                      : testSummary.results.length === 0
                        ? "border-[#A16207]/25 bg-[#A16207]/5"
                        : "border-[#6FAA7D]/25 bg-[#6FAA7D]/5"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {testSummary.failureCount > 0 ? (
                      <AlertCircle className="size-4 text-[#C0685C] shrink-0" />
                    ) : testSummary.results.length === 0 ? (
                      <AlertCircle className="size-4 text-[#A16207] shrink-0" />
                    ) : (
                      <CheckCircle2 className="size-4 text-[#6FAA7D] shrink-0" />
                    )}
                    <div className="text-[13px] text-[#141413]">
                      <span className="font-medium">
                        {testSummary.failureCount > 0 ? "检测完成（存在异常）" : testSummary.results.length === 0 ? "没有可检测的上架模型" : "检测完成（全部通过）"}
                      </span>
                      <span className="mx-1.5 text-[#78716C]/60">·</span>
                      <span className="text-[12px] text-[#78716C]">
                        测了 <span className="font-medium text-[#141413] tabular-nums">{testSummary.results.length}</span> 个模型
                        {" "}· 通过 <span className="font-medium text-[#467352] tabular-nums">{testSummary.successCount}</span> 个
                        {" "}· 未通过 <span className={cn("font-medium tabular-nums", testSummary.failureCount > 0 ? "text-[#C0685C]" : "text-[#78716C]")}>{testSummary.failureCount}</span> 个
                      </span>
                    </div>
                  </div>

                  {/* 每个模型一行铺开：通过看耗时，未通过看失败原因 */}
                  {testSummary.results.length > 0 && (
                    <div className="max-h-64 overflow-y-auto">
                      <ChannelModelTestList
                        rows={testSummary.results.map((r) => ({
                          name: getModelDisplayName(r.modelId),
                          detail: r.modelId,
                          ok: r.ok,
                          latencyMs: r.latencyMs,
                          error: r.error,
                        }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 检测进行中进度状态（杜绝假数字，显示「正在检测 N 个模型…」） */}
              {testingChannel && (
                <div
                  role="status"
                  className="shrink-0 mb-2 flex items-center gap-2 rounded-xl border border-[#E2E2DF] bg-[#FAF9F8] px-3.5 py-2.5 text-[12px] text-[#78716C]"
                >
                  <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
                  <span className="text-[#141413] font-medium">
                    正在检测 {currentInventory.length} 个模型…
                  </span>
                </div>
              )}

              {/* 顶部搜索与快捷批量操作 */}
              <div className="shrink-0 select-none space-y-2 py-2.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="按关键词过滤型号..."
                    className="h-8 pl-8 pr-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E] bg-white shadow-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[12px] text-[#78716C]">
                  <div>
                    已勾选 <span className="font-normal tabular-nums text-[#141413]">{selectedModelIds.size}</span> / 共 <span className="tabular-nums">{currentInventory.length}</span> 个
                    {searchQuery.trim() && (
                      <span className="ml-1.5 text-[#78716C]/80">
                        (匹配 {filteredModels.length} 项)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="s"
                      onClick={handleSelectAllFiltered}
                      disabled={isAllFilteredSelected || filteredModels.length === 0}
                      className="h-7 gap-1 px-2 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]"
                    >
                      <CheckCheck className="size-3 text-[#D97757]" /> 全选过滤结果
                    </Button>
                    <Button
                      variant="ghost"
                      size="s"
                      onClick={handleDeselectAllFiltered}
                      disabled={filteredModels.length === 0}
                      className="h-7 gap-1 px-2 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
                    >
                      <Square className="size-3" /> 取消全选
                    </Button>
                  </div>
                </div>
              </div>

              {/* 模型列表主体 */}
              <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white select-none">
                {currentInventory.length === 0 ? (
                  <div className="p-10 text-center text-[13px] text-[#78716C]">
                    此渠道尚未返回任何模型
                  </div>
                ) : filteredModels.length === 0 ? (
                  <div className="p-10 text-center text-[13px] text-[#78716C]">
                    未找到匹配的型号
                  </div>
                ) : (
              filteredModels.map((item) => {
                const isChecked = selectedModelIds.has(item.modelId);
                const readableName = resolveModelDisplayName(item.displayName, item.modelId);

                // 四类标识判定
                let categoryLabel = "储备中";
                let categoryClass = "bg-[#78716C]/10 text-[#78716C]";

                if (item.isGlobalActive) {
                  categoryLabel = "现役";
                  categoryClass = "bg-[#6FAA7D]/10 text-[#6FAA7D]";
                } else if (item.isEnabled) {
                  categoryLabel = "本渠道启用";
                  categoryClass = "bg-[#43718E]/10 text-[#43718E]";
                } else if (item.isNewlyDiscovered) {
                  categoryLabel = "新增";
                  categoryClass = "bg-[#B98A54]/10 text-[#B98A54]";
                }

                return (
                  <div
                    key={item.modelId}
                    role="option"
                    tabIndex={0}
                    aria-selected={isChecked}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowMouseDown(item.modelId, e as unknown as React.MouseEvent);
                      }
                    }}
                    onMouseDown={(e) => handleRowMouseDown(item.modelId, e)}
                    onMouseEnter={() => handleRowMouseEnter(item.modelId)}
                    className={cn(
                      "flex cursor-pointer select-none items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] transition-colors",
                      isChecked
                        ? "bg-[#FCFCFB] text-[#141413]"
                        : "text-[#1F1E1D] hover:bg-[#EBEBE9]/60",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={isChecked}
                        className="pointer-events-none shrink-0"
                        tabIndex={-1}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[13px] text-[#141413]">
                          {readableName}
                        </div>
                        <div className="truncate font-mono text-[12px] text-[#78716C]">
                          {item.modelId}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={cn("text-[12px] px-2 py-0.5 rounded-md font-normal", categoryClass)}>
                        {categoryLabel}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
            </>
          )}
        </DialogBody>

        {/* 弹窗 Footer */}
        <DialogFooter className="w-full flex-col items-stretch gap-2 border-t border-[#E2E2DF]/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="s"
              disabled={testingChannel || saving || isFirstLoading || currentInventory.length === 0}
              onClick={handleRunChannelTest}
              className="h-7 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
            >
              {testingChannel ? (
                <Loader2 className="size-3.5 animate-spin text-[#78716C]" />
              ) : (
                <Activity className="size-3.5 text-[#78716C]" />
              )}
              {testingChannel ? "正在检测…" : "检测此渠道全部模型"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="s"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-7 border-[#E2E2DF] text-[12px] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120"
            >
              取消
            </Button>
            <Button
              size="s"
              onClick={handleSave}
              disabled={saving || isFirstLoading || currentInventory.length === 0}
              className="h-7 gap-1 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存启用配置 ({selectedModelIds.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
