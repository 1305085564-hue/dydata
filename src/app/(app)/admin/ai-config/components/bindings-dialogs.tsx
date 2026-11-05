"use client";

import { useEffect, useState } from "react";
import { Sparkles, Check, ChevronDown, ChevronRight } from "lucide-react";
import { ModelFamilySelect } from "./model-family-select";
import { type AiFeatureControl } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function BindingDialog({
  control,
  open,
  onOpenChange,
  onSave,
}: {
  control: AiFeatureControl | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [modelId, setModelId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [outputTokenLimit, setOutputTokenLimit] = useState<number>(3600);
  const [contextMessageLimit, setContextMessageLimit] = useState<number>(30);
  const [ocrChannel, setOcrChannel] = useState<"baidu" | "vision">("baidu");
  const [showExpertSettings, setShowExpertSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setModelId(control?.modelId ?? null);
    setSystemPrompt(control?.systemPrompt ?? "");
    setOutputTokenLimit(control?.outputTokenLimit ?? 3600);
    setContextMessageLimit(control?.contextMessageLimit ?? 30);
    setOcrChannel(control?.ocrChannel ?? "baidu");
    setShowExpertSettings(false);
  }, [control, open]);

  const handleSubmit = async () => {
    if (!control) return;
    setLoading(true);
    try {
      const saved = await onSave({
        feature_key: control.key,
        model_id: modelId,
        system_prompt: systemPrompt.trim() ? systemPrompt.trim() : null,
        output_token_limit: outputTokenLimit,
        context_message_limit: contextMessageLimit,
        is_enabled: control.isEnabled,
        ...(control.key === "ocr_screenshot" ? { ocr_screenshot_channel: ocrChannel } : {}),
      });
      if (saved) onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const isOcr = control?.key === "ocr_screenshot";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog w-[94vw] sm:w-[720px] sm:max-w-[720px] max-h-[calc(100dvh-2rem)]">
        {/* 头部：标题与业务标识 */}
        <DialogHeader className="border-b border-[#E2E2DF]/60 pb-3 shrink-0">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-[20px] text-[#141413]">
                业务模型路由 · {isOcr ? "截图识别" : (control?.label ?? "业务功能")}
              </DialogTitle>
              {isOcr && (
                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#D97757]/10 text-[#D97757]">
                  核心
                </span>
              )}
              <span className="text-[12px] text-[#A8A29E] font-mono ml-1">
                key: {control?.key}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* 内容区 */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
          {/* 1. 截图识别专属：双通道模式选择卡 */}
          {isOcr && (
            <div className="space-y-2">
              <Label className="text-[12px] text-[#1F1E1D]">
                识别通道模式
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 模式 A：OCR + 模型 */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOcrChannel("baidu")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOcrChannel("baidu"); }}
                  className={cn(
                    "relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer select-none",
                    ocrChannel === "baidu"
                      ? "border-[#78716C]/50 bg-[#F1F1F0] ring-1 ring-[#141413]/15 shadow-none"
                      : "border-[#E2E2DF] bg-[#FCFCFB] hover:border-[#78716C]/40 hover:bg-white"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-[#141413]">
                          OCR+模型
                        </span>
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-normal bg-[#D97757]/10 text-[#D97757]">
                          <Sparkles className="size-3" /> 推荐
                        </span>
                      </div>
                      <div className={cn(
                        "size-4 rounded-full border flex items-center justify-center transition-colors",
                        ocrChannel === "baidu" ? "border-[#141413] bg-[#141413] text-white" : "border-[#E2E2DF] bg-white"
                      )}>
                        {ocrChannel === "baidu" && <Check className="size-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[12px] text-[#78716C] leading-snug">
                      百度 OCR 提字 + 大模型结构化归位
                    </p>
                  </div>
                  <div className="mt-2 pt-1 border-t border-[#E2E2DF]/60 text-[12px] text-[#A8A29E]">
                    成本低、字段极准，支持常规文本模型
                  </div>
                </div>

                {/* 模式 B：视觉直识 */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOcrChannel("vision")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOcrChannel("vision"); }}
                  className={cn(
                    "relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer select-none",
                    ocrChannel === "vision"
                      ? "border-[#78716C]/50 bg-[#F1F1F0] ring-1 ring-[#141413]/15 shadow-none"
                      : "border-[#E2E2DF] bg-[#FCFCFB] hover:border-[#78716C]/40 hover:bg-white"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] text-[#141413]">
                        视觉直识
                      </span>
                      <div className={cn(
                        "size-4 rounded-full border flex items-center justify-center transition-colors",
                        ocrChannel === "vision" ? "border-[#141413] bg-[#141413] text-white" : "border-[#E2E2DF] bg-white"
                      )}>
                        {ocrChannel === "vision" && <Check className="size-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[12px] text-[#78716C] leading-snug">
                      单视觉大模型端到端直接看图识别
                    </p>
                  </div>
                  <div className="mt-2 pt-1 border-t border-[#E2E2DF]/60 text-[12px] text-[#8A6A2F]">
                    链路极简，调度模型必须具备看图能力
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. 调度模型与系统提示词 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 pt-1">
            {/* 左列：系统提示词 */}
            <div className="flex flex-col space-y-2 h-full">
              <Label htmlFor="binding-system-prompt" className="text-[12px] text-[#1F1E1D]">
                系统提示词 (可选)
              </Label>
              <textarea
                id="binding-system-prompt"
                className="w-full flex-1 min-h-[140px] rounded-md border border-[#E2E2DF] bg-white p-3 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[#A8A29E] focus:outline-none focus:border-[#78716C] transition-colors resize-none leading-relaxed"
                placeholder="留空则使用代码内置的业务系统提示词..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </div>

            {/* 右列：模型调度与专家设置 */}
            <div className="space-y-3 flex flex-col justify-start">
              <div className="space-y-2">
                <Label className="text-[12px] text-[#1F1E1D]">
                  指定模型
                </Label>
                <ModelFamilySelect
                  value={modelId}
                  onChange={setModelId}
                  allowEmptyLabel="跟随全局默认"
                />
              </div>

              {/* 专家设置：默认折叠 */}
              <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowExpertSettings(!showExpertSettings)}
                  className="flex items-center justify-between w-full text-[12px] text-[#78716C] hover:text-[#141413] transition-colors"
                >
                  <span className="font-normal text-[#1F1E1D]">专家设置 (Token与上下文)</span>
                  {showExpertSettings ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>

                {showExpertSettings && (
                  <div className="space-y-3 pt-1 border-t border-[#E2E2DF]/60">
                    {/* 最大输出 Token */}
                    <div className="space-y-1">
                      <Label htmlFor="output-token-limit" className="text-[12px] text-[#1F1E1D]">
                        最大输出 Token
                      </Label>
                      <div className="relative">
                        <input
                          id="output-token-limit"
                          type="number"
                          min={1200}
                          max={8000}
                          step={200}
                          className="h-8 w-full rounded-md border border-[#E2E2DF] bg-white pl-2 pr-14 text-[14px] text-[#1F1E1D] shadow-input focus:outline-none focus:border-[#78716C] transition-colors"
                          value={outputTokenLimit}
                          onChange={(e) => setOutputTokenLimit(Number.parseInt(e.target.value, 10) || 3600)}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-[#A8A29E]">
                          tokens
                        </span>
                      </div>
                    </div>

                    {/* 上下文消息轮数 */}
                    <div className="space-y-1">
                      <Label htmlFor="context-limit" className="text-[12px] text-[#1F1E1D]">
                        上下文消息轮数
                      </Label>
                      <div className="relative">
                        <input
                          id="context-limit"
                          type="number"
                          min={1}
                          max={50}
                          className="h-8 w-full rounded-md border border-[#E2E2DF] bg-white pl-2 pr-10 text-[14px] text-[#1F1E1D] shadow-input focus:outline-none focus:border-[#78716C] transition-colors"
                          value={contextMessageLimit}
                          onChange={(e) => setContextMessageLimit(Number.parseInt(e.target.value, 10) || 30)}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-[#A8A29E]">
                          轮
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作区 */}
        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3 shrink-0 flex items-center justify-between sm:justify-between">
          <span className="text-[12px] text-[#78716C]">
            保存后生效
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="s"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-8 px-3 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              取消
            </Button>
            <Button
              size="s"
              onClick={handleSubmit}
              disabled={loading}
              className="h-8 px-4 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              {loading ? "保存中…" : "保存高级设置"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
