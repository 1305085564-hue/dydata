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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>高级配置 · {control?.label ?? "业务功能"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-3">
          <p className="text-[13px] leading-5 text-[#78716C]">{control?.description}</p>
          {control?.key === "ocr_screenshot" && (
            <Alert variant="warning">
              <span className="text-[13px] leading-relaxed text-[#1F1E1D]">
                「看图回退」通道必须绑定支持图片输入的视觉模型；如果模型只支持文本，切回视觉通道后首页上传会识别失败。
              </span>
            </Alert>
          )}
          {control?.key === "ocr_screenshot_structure" && (
            <Alert variant="info">
              <span className="text-[13px] leading-relaxed text-[#78716C]">
                「文字结构化」只接收 OCR 提取的文字行，绑定文本模型即可，无需图片能力。
              </span>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="binding-model">首选模型系列</Label>
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

          <div className="space-y-2">
            <Label htmlFor="binding-system-prompt">系统提示词 (System Prompt，可选)</Label>
            <textarea
              id="binding-system-prompt"
              rows={4}
              className="w-full rounded-md border border-[#E2E2DF] bg-[#FCFCFB]/50 p-2.5 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[#A8A29E] focus:outline-none focus:border-[#D97757]"
              placeholder="留空则使用代码内置的默认业务提示词..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="output-token-limit">最大输出 Token</Label>
              <input
                id="output-token-limit"
                type="number"
                min={1200}
                max={8000}
                step={200}
                className="h-9 w-full rounded-md border border-[#E2E2DF] bg-[#FCFCFB]/50 px-3 text-[13px] text-[#1F1E1D] shadow-input"
                value={outputTokenLimit}
                onChange={(e) => setOutputTokenLimit(Number.parseInt(e.target.value, 10) || 3600)}
              />
              <p className="text-[12px] text-[#78716C]">范围 1200 - 8000</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="context-limit">上下文消息轮数</Label>
              <input
                id="context-limit"
                type="number"
                min={1}
                max={50}
                className="h-9 w-full rounded-md border border-[#E2E2DF] bg-[#FCFCFB]/50 px-3 text-[13px] text-[#1F1E1D] shadow-input"
                value={contextMessageLimit}
                onChange={(e) => setContextMessageLimit(Number.parseInt(e.target.value, 10) || 30)}
              />
              <p className="text-[12px] text-[#78716C]">范围 1 - 50</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E2E2DF] px-3.5 py-2.5">
            <div>
              <Label>启用状态</Label>
              <p className="mt-0.5 text-[12px] text-[#78716C]">关闭后，该功能在前台不会发起 AI 请求。</p>
            </div>
            <Switch aria-label={`启用${control?.label ?? "业务功能"}`} checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
          {!isEnabled && <p className="text-[12px] text-[#B98A54]">前台将阻止发起该业务请求，可随时恢复</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="s" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button size="s" onClick={handleSubmit} disabled={loading}>保存高级设置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
