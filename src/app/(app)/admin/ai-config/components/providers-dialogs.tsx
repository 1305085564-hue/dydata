"use client";

import { useEffect, useState } from "react";

import { AiProvider, AiProviderKey, AiProviderKeyModel } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const defaultProviderForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProvider>;
const defaultKeyForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProviderKey>;
const defaultModelForm = { is_enabled: true } satisfies Partial<AiProviderKeyModel>;

export function ProviderDialog({
  provider,
  open,
  onOpenChange,
  onSave,
}: {
  provider: Partial<AiProvider> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<AiProvider>>(defaultProviderForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData(provider ? { ...defaultProviderForm, ...provider } : defaultProviderForm);
  }, [provider, open]);

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider?.id ? "编辑渠道" : "新建渠道"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>渠道名称</Label>
            <Input
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: api7"
            />
          </div>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={formData.base_url || ""}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              placeholder="例如: https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-2">
            <Label>描述 (可选)</Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>是否启用</Label>
            <Switch
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>
          <div className="space-y-2">
            <Label>优先级 (数字越小越优先)</Label>
            <Input
              type="number"
              value={formData.priority ?? 50}
              onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 50 })}
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

export function KeyDialog({
  apiKey,
  providerId,
  open,
  onOpenChange,
  onSave,
}: {
  apiKey: Partial<AiProviderKey> | null;
  providerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<AiProviderKey>>(defaultKeyForm);
  const [loading, setLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");

  useEffect(() => {
    setFormData(apiKey ? { ...defaultKeyForm, ...apiKey } : defaultKeyForm);
    setApiKeyValue("");
  }, [apiKey, open]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave({
        ...formData,
        provider_id: providerId,
        api_key: apiKeyValue,
      } as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{apiKey?.id ? "编辑 API 分组" : "新建 API 分组"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>分组名称</Label>
            <Input
              value={formData.label || ""}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="例如: default"
            />
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder={apiKey?.id ? "留空表示不修改" : "sk-..."}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>是否启用</Label>
            <Switch
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>
          <div className="space-y-2">
            <Label>优先级</Label>
            <Input
              type="number"
              value={formData.priority ?? 50}
              onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 50 })}
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

export function ModelDialog({
  model,
  keyId,
  open,
  onOpenChange,
  onSave,
}: {
  model: Partial<AiProviderKeyModel> | null;
  keyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<AiProviderKeyModel>>(defaultModelForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData(model ? { ...defaultModelForm, ...model } : defaultModelForm);
  }, [model, open]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave({ ...formData, key_id: keyId } as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{model?.id ? "编辑模型" : "添加模型"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>模型标识 (Model ID)</Label>
            <Input
              value={formData.model_id || ""}
              onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
              placeholder="例如: gpt-4"
              disabled={!!model?.id}
            />
          </div>
          <div className="space-y-2">
            <Label>展示名称 (可选)</Label>
            <Input
              value={formData.display_name || ""}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="例如: GPT-4 Turbo"
            />
          </div>
          <div className="flex items-center justify-between">
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
