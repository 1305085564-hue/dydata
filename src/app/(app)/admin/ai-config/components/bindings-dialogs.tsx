"use client";

import { useEffect, useState } from "react";

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
  const [providerKeyModelId, setProviderKeyModelId] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProviderKeyModelId(control?.providerKeyModelId ?? null);
    setIsEnabled(control?.isEnabled ?? true);
  }, [control, open]);

  const handleSubmit = async () => {
    if (!control) return;
    setLoading(true);
    try {
      const saved = await onSave({
        feature_key: control.key,
        provider_key_model_id: providerKeyModelId,
        system_prompt: control.systemPrompt,
        output_token_limit: control.outputTokenLimit,
        context_message_limit: control.contextMessageLimit,
        is_enabled: isEnabled,
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
          <div className="space-y-2">
            <Label htmlFor="binding-model">模型策略</Label>
            <select
              id="binding-model"
              className="h-9 w-full rounded-md border border-[#E5E0D6] bg-white px-3 text-[13px]"
              value={providerKeyModelId ?? ""}
              onChange={(event) => setProviderKeyModelId(event.target.value || null)}
            >
              <option value="">自动选择当前健康模型</option>
              {bundle?.models.map((model) => {
                const key = bundle.keys.find((item) => item.id === model.key_id);
                const provider = bundle.providers.find((item) => item.id === key?.provider_id);
                const enabled = model.is_enabled && (key?.is_enabled ?? true) && (provider?.is_enabled ?? true);
                return (
                  <option key={model.id} value={model.id} disabled={!enabled}>
                    {provider?.name || "未知渠道"} / {model.display_name || model.model_id}{!enabled ? "（已停用）" : ""}
                  </option>
                );
              })}
            </select>
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
