"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Search, X, CheckCheck, Square, Loader2 } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

interface SyncModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
  keyLabel: string;
  providerName: string;
  availableModels: string[];
  initialSelectedModelIds: string[];
  onSave: (keyId: string, modelIds: string[]) => Promise<boolean>;
}

export function SyncModelsDialog({
  open,
  onOpenChange,
  keyId,
  keyLabel,
  providerName,
  availableModels,
  initialSelectedModelIds,
  onSave,
}: SyncModelsDialogProps) {
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // 滑动选择状态控制
  const isMouseDownRef = useRef(false);
  const targetCheckedRef = useRef(true);

  useEffect(() => {
    if (open) {
      setSelectedModelIds(new Set(initialSelectedModelIds));
      setSearchQuery("");
      isMouseDownRef.current = false;
    }
  }, [open, initialSelectedModelIds]);

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

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableModels;
    return availableModels.filter((m) => m.toLowerCase().includes(q));
  }, [availableModels, searchQuery]);

  const handleRowMouseDown = (modelId: string, e: React.MouseEvent) => {
    // 仅响应鼠标主键 (左键)
    if (e.button !== 0) return;
    e.preventDefault(); // 阻止浏览器原生文本选区与拖拽

    const currentlyChecked = selectedModelIds.has(modelId);
    const nextState = !currentlyChecked;

    targetCheckedRef.current = nextState;
    isMouseDownRef.current = true;

    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (nextState) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  };

  const handleRowMouseEnter = (modelId: string) => {
    if (!isMouseDownRef.current) return;

    const nextState = targetCheckedRef.current;
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (nextState) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((m) => next.add(m));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((m) => next.delete(m));
      return next;
    });
  };

  const handleSave = async () => {
    if (!keyId) return;
    if (selectedModelIds.size === 0) {
      feedbackToast.error("至少保留一项可用型号；若暂不使用该渠道，可直接停用该密钥。");
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

  const isAllFilteredSelected =
    filteredModels.length > 0 &&
    filteredModels.every((m) => selectedModelIds.has(m));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[94vw] flex-col overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white p-6 shadow-claude-dialog sm:max-w-3xl">
        {/* 弹窗 Header */}
        <DialogHeader className="gap-1.5 pb-2 border-b border-[#ECE7DE]/70">
          <DialogTitle className="text-base font-semibold text-[#1C1917] flex items-center gap-2">
            <span>{providerName}</span>
            <span className="text-[13px] font-normal text-[#78716C]">
              · {keyLabel}
            </span>
          </DialogTitle>
          <p className="text-[12px] text-[#78716C] leading-normal">
            已从渠道获取 {availableModels.length} 个可用型号。按住鼠标划过可批量启用或取消。
          </p>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden py-1">
          {/* 顶部搜索与快捷批量操作 */}
          <div className="shrink-0 select-none space-y-2 py-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#78716C]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="按关键词过滤型号..."
                className="h-9 border-[#E5E0D6] pl-9 pr-8 text-[13px] focus-visible:ring-[#D97757]/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[13px] text-[#78716C]">
              <div>
                已启用 <span className="font-mono font-medium tabular-nums text-[#1C1917]">{selectedModelIds.size}</span> / {availableModels.length} 个型号
                {searchQuery.trim() && (
                  <span className="ml-1.5 text-[#78716C]/80">
                    (匹配 {filteredModels.length} 项)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllFiltered}
                  disabled={isAllFilteredSelected || filteredModels.length === 0}
                  className="h-7 gap-1 px-2 text-[13px] text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                >
                  <CheckCheck className="size-3 text-[#D97757]" /> 全选过滤结果
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeselectAllFiltered}
                  disabled={filteredModels.length === 0}
                  className="h-7 gap-1 px-2 text-[13px] text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                >
                  <Square className="size-3" /> 取消全选
                </Button>
              </div>
            </div>
          </div>

          {/* 模型列表：支持按住鼠标滑动批量选择 */}
          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#ECE7DE]/50 rounded-xl border border-[#E5E0D6] bg-white select-none">
            {filteredModels.length === 0 ? (
              <div className="p-10 text-center text-[13px] text-[#78716C]">
                {searchQuery ? "未找到匹配的型号" : "还没有可启用的型号"}
              </div>
            ) : (
              filteredModels.map((mId) => {
                const isChecked = selectedModelIds.has(mId);
                return (
                  <div
                    key={mId}
                    onMouseDown={(e) => handleRowMouseDown(mId, e)}
                    onMouseEnter={() => handleRowMouseEnter(mId)}
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-3 px-3.5 py-2 text-[13px] transition-colors",
                      isChecked
                        ? "bg-[#FAF8F4] font-medium text-[#1C1917]"
                        : "text-[#292524] hover:bg-[#F5F3EE]/60",
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      className="pointer-events-none"
                      aria-hidden="true"
                    />
                    <span className="truncate font-mono text-[12px]">
                      {mId}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </DialogBody>

        {/* 弹窗 Footer */}
        <DialogFooter className="w-full flex-col items-stretch gap-2 border-t border-[#ECE7DE]/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[13px] text-[#78716C]">
            确认勾选后保存生效
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-9 border-[#E5E0D6] text-[13px] hover:bg-[#F5F3EE]"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-9 gap-1.5 bg-[#D97757] text-[13px] text-white hover:bg-[#C46A4D]"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              保存启用配置 ({selectedModelIds.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
