"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
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
      <DialogContent className="sm:max-w-3xl w-[94vw] max-h-[90vh] flex flex-col p-6 rounded-2xl border border-[#E5E0D6] bg-white shadow-claude-dialog overflow-hidden">
        {/* 弹窗 Header */}
        <DialogHeader className="gap-1.5 pb-2 border-b border-[#ECE7DE]/70">
          <DialogTitle className="text-base font-medium text-[#1C1917] flex items-center gap-2">
            <span>{providerName}</span>
            <span className="text-[13px] font-normal text-[#78716C]">
              · {keyLabel}
            </span>
          </DialogTitle>
          <p className="text-[12px] text-[#78716C] leading-normal">
            已从渠道获取 {availableModels.length} 个可用型号。按住鼠标划过可批量启用或取消。
          </p>
        </DialogHeader>

        {/* 顶部搜索与快捷批量操作 */}
        <div className="py-2.5 space-y-2 select-none">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#78716C]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="按关键词过滤型号..."
              className="pl-9 pr-8 h-9 text-[13px] bg-white border-[#E5E0D6] focus-visible:ring-[#D97757]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-[#F5F3EE] text-[#78716C] hover:text-[#1C1917]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[12px] text-[#78716C] px-0.5">
            <div>
              已启用 <span className="font-mono font-medium text-[#1C1917] tabular-nums">{selectedModelIds.size}</span> / {availableModels.length} 个型号
              {searchQuery.trim() && (
                <span className="text-[#78716C]/80 ml-1.5">
                  (匹配 {filteredModels.length} 项)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAllFiltered}
                disabled={isAllFilteredSelected || filteredModels.length === 0}
                className="h-6 px-2 text-[12px] gap-1 text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
              >
                <CheckCheck className="size-3 text-[#D97757]" /> 全选过滤结果
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAllFiltered}
                disabled={filteredModels.length === 0}
                className="h-6 px-2 text-[12px] gap-1 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
              >
                <Square className="size-3" /> 取消全选
              </Button>
            </div>
          </div>
        </div>

        {/* 模型列表：支持按住鼠标滑动批量选择 */}
        <div className="flex-1 min-h-[260px] max-h-[50vh] overflow-y-auto border border-[#E5E0D6] rounded-xl bg-white select-none divide-y divide-[#ECE7DE]/50">
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
                    "flex items-center gap-3 px-3.5 py-2 text-[13px] cursor-pointer transition-colors select-none",
                    isChecked
                      ? "bg-[#FAF8F4] text-[#1C1917] font-medium"
                      : "text-[#292524] hover:bg-[#F5F3EE]/60"
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    className="pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[12px] truncate">
                    {mId}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* 弹窗 Footer */}
        <DialogFooter className="pt-4 border-t border-[#ECE7DE]/70 flex items-center justify-between sm:justify-between w-full">
          <div className="text-[12px] text-[#78716C]">
            确认勾选后保存生效
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-8 text-[12px] border-[#E5E0D6] hover:bg-[#F5F3EE]"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-[12px] gap-1.5 bg-[#D97757] hover:bg-[#C46A4D] text-white"
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
