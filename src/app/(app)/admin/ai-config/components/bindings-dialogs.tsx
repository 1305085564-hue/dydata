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
  const [ocrChannel, setOcrChannel] = useState<"baidu" | "vision">("baidu");
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const modelOptions = useMemo(() => (bundle ? buildModelDirectory(bundle) : []), [bundle]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时同步功能开关表单初始值（受控弹窗重置惯例）
    setModelId(control?.modelId ?? null);
    setOcrChannel(control?.key === "ocr_screenshot" ? (control?.ocrChannel ?? "baidu") : "baidu");
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
        system_prompt: control.systemPrompt,
        output_token_limit: control.outputTokenLimit,
        context_message_limit: control.contextMessageLimit,
        is_enabled: isEnabled,
        ...(control.key === "ocr_screenshot"
          ? { ocr_screenshot_channel: ocrChannel }
          : {}),
      });
      if (saved) onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>设置{control?.label ?? "业务功能"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-3">
          <p className="text-[13px] leading-5 text-[#78716C]">{control?.description}</p>
          {control?.key === "ocr_screenshot" && (
            <Alert variant="warning">
              <span className="text-[12.5px] leading-relaxed text-[#292524]">
                「看图回退」通道必须绑定支持图片输入的视觉模型；如果模型只支持文本，切回视觉通道后首页上传会识别失败。
              </span>
            </Alert>
          )}
          {control?.key === "ocr_screenshot_structure" && (
            <Alert variant="info">
              <span className="text-[12.5px] leading-relaxed text-[#78716C]">
                「文字结构化」只接收 OCR 提取的文字行，绑定文本模型即可，无需图片能力。
              </span>
            </Alert>
          )}
          {control?.key === "ocr_screenshot" && (
            <div className="space-y-2">
              <Label htmlFor="binding-ocr-channel">识别通道</Label>
              <select
                id="binding-ocr-channel"
                className="h-9 w-full rounded-md border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 text-[13px] text-[#292524]"
                value={ocrChannel}
                onChange={(event) =>
                  setOcrChannel(event.target.value === "vision" ? "vision" : "baidu")
                }
              >
                <option value="baidu">百度 OCR（默认）</option>
                <option value="vision">视觉模型（旧通道回退）</option>
              </select>
              <p className="text-[12px] text-[#78716C]">
                切换保存后立即生效，无需发版；百度通道故障时可一键切回视觉模型。
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="binding-model">模型（主）</Label>
            <ModelChainSelect
              modelDirectory={modelOptions}
              value={modelId}
              onChange={setModelId}
              id="binding-model"
              allowEmptyLabel="不指定 · 走全局默认兜底"
            />
            {control?.key === "ocr_screenshot" && modelId && (
              <p className="text-[12px] text-[#8A5A22]">
                注意：看图回退需要支持图片输入的视觉模型，请确认所选模型具备图片能力。
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#E5E0D6] px-3 py-2.5">
            <div>
              <Label>允许使用</Label>
              <p className="mt-0.5 text-[12px] text-[#78716C]">关闭后，该功能不会再向 AI 发起请求。</p>
            </div>
            <Switch aria-label={`启用${control?.label ?? "业务功能"}`} checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
