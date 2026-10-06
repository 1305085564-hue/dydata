"use client";

import { useEffect, useMemo, useState } from "react";

import { buildModelDirectory } from "../model-directory";
import { ModelChainSelect } from "./model-chain-select";

import { type AiFeatureControl, useAiConfig } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";

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
  const { bundle } = useAiConfig();
  const [modelId, setModelId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [outputTokenLimit, setOutputTokenLimit] = useState<number>(3600);
  const [contextMessageLimit, setContextMessageLimit] = useState<number>(30);
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const modelOptions = useMemo(() => (bundle ? buildModelDirectory(bundle) : []), [bundle]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时同步功能开关表单初始值（受控弹窗重置惯例）
    setModelId(control?.modelId ?? null);
    setSystemPrompt(control?.systemPrompt ?? "");
    setOutputTokenLimit(control?.outputTokenLimit ?? 3600);
    setContextMessageLimit(control?.contextMessageLimit ?? 30);
    setIsEnabled(control?.isEnabled ?? true);
  }, [control, open]);

  const handleSubmit = async () => {
    if (!control) return;
    setLoading(true);
    try {
      const saved = await onSave({
        feature_key: control.key,
        model_id: modelId,
        provider_key_model_id: control.providerKeyModelId,
        system_prompt: systemPrompt.trim() ? systemPrompt.trim() : null,
        output_token_limit: outputTokenLimit,
        context_message_limit: contextMessageLimit,
        is_enabled: isEnabled,
      });
      if (saved) onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[94vw] max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
        <DialogHeader className="gap-1 border-b border-[#E2E2DF]/60 pb-3">
          <DialogTitle className="text-[18px] font-medium text-[#141413]">
            业务模型路由 · {control?.label ?? "业务功能"}
          </DialogTitle>
          <p className="text-[12px] text-[#78716C] leading-relaxed">{control?.description}</p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
          {control?.key === "ocr_screenshot" && (
            <div className="rounded-xl border border-[#B98A54]/20 bg-[#B98A54]/8 p-3 text-[12px] text-[#B98A54] leading-relaxed">
              「看图回退」通道必须绑定支持图片输入的视觉模型；如果模型只支持文本，切回视觉通道后首页上传会识别失败。
            </div>
          )}
          {control?.key === "ocr_screenshot_structure" && (
            <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-3 text-[12px] text-[#78716C] leading-relaxed">
              「文字结构化」只接收 OCR 提取的文字行，绑定文本模型即可，无需图片能力。
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="binding-model" className="text-[12px] text-[#78716C]">
              首选模型系列
            </Label>
            <ModelChainSelect
              modelDirectory={modelOptions}
              value={modelId}
              onChange={setModelId}
              id="binding-model"
              allowEmptyLabel="不指定 · 跟随全局默认兜底"
            />
            {control?.key === "ocr_screenshot" && modelId && (
              <p className="text-[12px] text-[#B98A54]">
                注意：看图回退需要支持图片输入的视觉模型，请确认所选模型具备图片能力。
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="binding-system-prompt" className="text-[12px] text-[#78716C]">
              系统提示词 (System Prompt，可选)
            </Label>
            <textarea
              id="binding-system-prompt"
              rows={3}
              className="w-full rounded-md border border-[#E2E2DF] bg-white p-2.5 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#D97757]"
              placeholder="留空则使用代码内置的默认业务提示词..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="output-token-limit" className="text-[12px] text-[#78716C]">
                最大输出 Token
              </Label>
              <input
                id="output-token-limit"
                type="number"
                min={1200}
                max={8000}
                step={200}
                className="h-8 w-full rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                value={outputTokenLimit}
                onChange={(e) => setOutputTokenLimit(Number.parseInt(e.target.value, 10) || 3600)}
              />
              <p className="text-[12px] text-[#A8A29E]">范围 1200 - 8000</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="context-limit" className="text-[12px] text-[#78716C]">
                上下文消息轮数
              </Label>
              <input
                id="context-limit"
                type="number"
                min={1}
                max={50}
                className="h-8 w-full rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                value={contextMessageLimit}
                onChange={(e) => setContextMessageLimit(Number.parseInt(e.target.value, 10) || 30)}
              />
              <p className="text-[12px] text-[#A8A29E]">范围 1 - 50</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E2E2DF] bg-[#FCFCFB]/60 px-3.5 py-2.5">
            <div>
              <Label className="text-[13px] font-normal text-[#1F1E1D]">启用状态</Label>
              <p className="mt-0.5 text-[12px] text-[#78716C]">关闭后，该功能在前台不会发起 AI 请求</p>
            </div>
            <Switch
              aria-label={`启用${control?.label ?? "业务功能"}`}
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>
          {!isEnabled && (
            <div className="rounded-md border border-[#B98A54]/20 bg-[#B98A54]/8 p-2 text-[12px] text-[#B98A54]">
              前台将阻止发起该业务请求，可随时恢复开启
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
          <Button
            variant="outline"
            size="s"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>
          <Button
            size="s"
            onClick={handleSubmit}
            disabled={loading}
            className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
          >
            {loading ? "保存中…" : "保存高级设置"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
