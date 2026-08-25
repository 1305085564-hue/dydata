"use client";

import { useEffect, useMemo, useState } from "react";

import { type AiFeatureControl, useAiConfig } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

  // 模型为主：按模型聚合可用渠道（渠道顺位由系统按 Key/供应商优先级自动排列）
  const modelOptions = useMemo(() => {
    if (!bundle) return [];
    const byModel = new Map<string, { modelId: string; label: string; channels: { name: string; score: number }[] }>();
    for (const model of bundle.models) {
      if (!model.is_enabled) continue;
      const key = bundle.keys.find((item) => item.id === model.key_id);
      if (!key || !key.is_enabled) continue;
      const provider = bundle.providers.find((item) => item.id === key.provider_id);
      if (!provider || !provider.is_enabled) continue;
      const entry = byModel.get(model.model_id) ?? {
        modelId: model.model_id,
        label: model.display_name || model.model_id,
        channels: [],
      };
      entry.channels.push({ name: `${provider.name} / ${key.label}`, score: key.priority + provider.priority });
      byModel.set(model.model_id, entry);
    }
    return [...byModel.values()]
      .map((entry) => ({ ...entry, channels: [...entry.channels].sort((a, b) => a.score - b.score) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bundle]);

  useEffect(() => {
    setModelId(control?.modelId ?? null);
    setOcrChannel(control?.key === "ocr_screenshot" ? (control?.ocrChannel ?? "baidu") : "baidu");
    setIsEnabled(control?.isEnabled ?? true);
  }, [control, open]);

  const selectedOption = modelOptions.find((option) => option.modelId === modelId) ?? null;

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
        <div className="space-y-5 py-3">
          <p className="text-[13px] leading-5 text-[#78716C]">{control?.description}</p>
          {control?.key === "ocr_screenshot" && (
            <div className="rounded-lg border border-[#D99E55]/35 bg-[#FFF8ED] px-3 py-2.5 text-[12px] leading-5 text-[#8A5A22]">
              「看图回退」通道必须绑定支持图片输入的视觉模型；如果模型只支持文本，切回视觉通道后首页上传会识别失败。
            </div>
          )}
          {control?.key === "ocr_screenshot_structure" && (
            <div className="rounded-lg border border-[#43718E]/30 bg-[#F0F5F8] px-3 py-2.5 text-[12px] leading-5 text-[#2E5876]">
              「文字结构化」只接收 OCR 提取的文字行，绑定文本模型即可，无需图片能力。
            </div>
          )}
          {control?.key === "ocr_screenshot" && (
            <div className="space-y-2">
              <Label htmlFor="binding-ocr-channel">识别通道</Label>
              <select
                id="binding-ocr-channel"
                className="h-9 w-full rounded-md border border-[#E5E0D6] bg-white px-3 text-[13px]"
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
            <select
              id="binding-model"
              className="h-9 w-full rounded-md border border-[#E5E0D6] bg-white px-3 text-[13px]"
              value={modelId ?? ""}
              onChange={(event) => setModelId(event.target.value || null)}
            >
              <option value="">不指定 · 走全局默认兜底</option>
              {modelOptions.map((option) => (
                <option key={option.modelId} value={option.modelId}>
                  {option.label}（{option.channels.length} 个渠道可用）
                </option>
              ))}
            </select>
            <p className="text-[12px] text-[#78716C]">
              绑定的是模型，不是渠道。该模型的渠道顺位由系统自动排列，首选失败会自动切到下一个渠道的同一模型。
            </p>
            {selectedOption && (
              <div className="rounded-lg border border-[#E5E0D6] bg-[#FBF9F5]/70 px-3 py-2 text-[12px] leading-5 text-[#292524]">
                <span className="font-medium">{selectedOption.label} 当前顺位：</span>
                <ol className="mt-1 space-y-0.5 list-decimal list-inside text-[#78716C]">
                  {selectedOption.channels.map((channel, index) => (
                    <li key={`${channel.name}-${index}`}>
                      {channel.name}
                      {index === 0 && (
                        <span className="ml-1.5 text-[10px] font-medium text-[#16A34A]">首选</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
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
