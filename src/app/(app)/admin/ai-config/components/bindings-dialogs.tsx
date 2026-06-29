"use client";

import { useEffect, useState } from "react";

import { AiFeatureBinding, useAiConfig } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const defaultBindingForm = { is_enabled: true, output_token_limit: 3600, context_message_limit: 30 } satisfies Partial<AiFeatureBinding>;

export function BindingDialog({
  binding,
  open,
  onOpenChange,
  onSave,
}: {
  binding: Partial<AiFeatureBinding> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const { bundle } = useAiConfig();
  const [formData, setFormData] = useState<Partial<AiFeatureBinding>>(defaultBindingForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData(binding ? { ...defaultBindingForm, ...binding } : defaultBindingForm);
  }, [binding, open]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave(formData as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{binding?.id ? "编辑功能绑定" : "添加功能绑定"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label>功能标识 (Key)</Label>
            <Input
              value={formData.feature_key || ""}
              onChange={(e) => setFormData({ ...formData, feature_key: e.target.value })}
              placeholder="例如: video_diagnose"
              disabled={!!binding?.id}
            />
          </div>
          <div className="space-y-2">
            <Label>功能名称</Label>
            <Input
              value={formData.label || ""}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="例如: 视频诊断"
            />
          </div>
          <div className="space-y-2">
            <Label>绑定模型</Label>
            <select
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm"
              value={formData.provider_key_model_id || ""}
              onChange={(e) => setFormData({ ...formData, provider_key_model_id: e.target.value || null })}
            >
              <option value="">自动分配 (Failover)</option>
              {bundle?.models.map((model) => {
                const key = bundle.keys.find((item) => item.id === model.key_id);
                const provider = bundle.providers.find((item) => item.id === key?.provider_id);
                const label = `${provider?.name || "未知"} / ${key?.label || "未知"} / ${model.display_name || model.model_id}`;
                return (
                  <option key={model.id} value={model.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-2">
            <Label>System Prompt (可选)</Label>
            <Textarea
              className="min-h-[100px]"
              value={formData.system_prompt || ""}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              placeholder="自定义系统提示词，留空则使用代码中的默认值"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>上下文轮数限制</Label>
              <Input
                type="number"
                value={formData.context_message_limit ?? 30}
                onChange={(e) => setFormData({ ...formData, context_message_limit: Number.parseInt(e.target.value, 10) || 30 })}
              />
            </div>
            <div className="space-y-2">
              <Label>输出 Token 限制</Label>
              <Input
                type="number"
                value={formData.output_token_limit ?? 3600}
                onChange={(e) => setFormData({ ...formData, output_token_limit: Number.parseInt(e.target.value, 10) || 3600 })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label>是否启用</Label>
            <Switch
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
