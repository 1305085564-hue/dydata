"use client";

import { useEffect, useMemo, useState } from "react";
import { AiProvider, AiProviderKey, AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";

const defaultProviderForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProvider>;
const defaultKeyForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProviderKey>;
const defaultModelForm = { is_enabled: true } satisfies Partial<AiProviderKeyModel>;

// 预设常见通用模型（防冷启动）
const POPULAR_PRESET_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "gpt-4o",
  "gpt-4o-mini",
  "deepseek-chat",
  "deepseek-reasoner",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "qwen-max",
];

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
    if (!formData.name?.trim()) {
      feedbackToast.error("请输入渠道名称");
      return;
    }
    if (!formData.base_url?.trim()) {
      feedbackToast.error("请输入 Base URL");
      return;
    }
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
            <Label htmlFor="provider-name">渠道名称</Label>
            <Input
              id="provider-name"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: API中转站A / 官方OpenAI"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              value={formData.base_url || ""}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              placeholder="例如: https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-description">描述 (可选)</Label>
            <Textarea
              id="provider-description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="填写此渠道的特点或备注..."
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>是否启用</Label>
            <Switch
              aria-label="是否启用渠道"
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
  const { bundle } = useAiConfig();
  const [formData, setFormData] = useState<Partial<AiProviderKey>>(defaultKeyForm);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");

  useEffect(() => {
    setFormData(apiKey ? { ...defaultKeyForm, ...apiKey } : defaultKeyForm);
    setSelectedProviderId(providerId || apiKey?.provider_id || bundle?.providers[0]?.id || "");
    setApiKeyValue("");
  }, [apiKey, providerId, open, bundle]);

  const handleSubmit = async () => {
    if (!formData.label?.trim()) {
      feedbackToast.error("请输入 Key / 分组名称");
      return;
    }
    if (!apiKey?.id && !apiKeyValue.trim()) {
      feedbackToast.error("请输入 API Key");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        ...formData,
        provider_id: selectedProviderId || providerId,
      };
      if (!apiKey?.id || apiKeyValue.trim()) payload.api_key = apiKeyValue;
      await onSave(payload);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{apiKey?.id ? "编辑 API 密钥分组" : "新建 API 密钥分组"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="provider-select">所属渠道 (Provider)</Label>
            <select
              id="provider-select"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-zinc-200 bg-white"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
            >
              {bundle?.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.is_enabled} className={!p.is_enabled ? "text-zinc-400" : ""}>
                  {p.name} ({p.base_url}){!p.is_enabled ? " (已停用)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="key-label">分组 / Key 名称</Label>
            <Input
              id="key-label"
              value={formData.label || ""}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="例如: 主账号-Key1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder={apiKey?.id ? "留空表示不修改" : "sk-..."}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>是否启用</Label>
            <Switch
              aria-label="是否启用分组"
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="key-priority">顺位优先级 (数字越小优先级越高，1 为首选)</Label>
            <Input
              id="key-priority"
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
  initialModelId,
  open,
  onOpenChange,
  onSave,
}: {
  model?: Partial<AiProviderKeyModel> | null;
  keyId: string | null;
  initialModelId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const { bundle } = useAiConfig();
  const [formData, setFormData] = useState<Partial<AiProviderKeyModel>>(defaultModelForm);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // 汇总已用过的所有历史模型
  const allHistoryModels = useMemo(() => {
    const set = new Set<string>(POPULAR_PRESET_MODELS);
    bundle?.models.forEach((m) => {
      if (m.model_id) set.add(m.model_id.trim());
    });
    return Array.from(set);
  }, [bundle]);

  useEffect(() => {
    setFormData(
      model
        ? { ...defaultModelForm, ...model }
        : { ...defaultModelForm, model_id: initialModelId || "" }
    );
    setSelectedKeyId(keyId || bundle?.keys[0]?.id || "");
  }, [model, keyId, initialModelId, open, bundle]);

  const handleSubmit = async () => {
    if (!formData.model_id?.trim()) {
      feedbackToast.error("请输入或点选模型标识");
      return;
    }
    setLoading(true);
    try {
      await onSave({
        ...formData,
        key_id: selectedKeyId || keyId,
      } as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{model?.id ? "编辑模型" : "添加模型关联"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-3">
          {/* 选择绑定的 Key */}
          <div className="space-y-1.5">
            <Label htmlFor="model-key-select">绑定的 API Key 渠道分组</Label>
            <select
              id="model-key-select"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-zinc-200 bg-white"
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
            >
              {bundle?.keys.map((k) => {
                const provider = bundle.providers.find((p) => p.id === k.provider_id);
                const isEnabled = k.is_enabled && (provider ? provider.is_enabled : true);
                return (
                  <option key={k.id} value={k.id} disabled={!isEnabled} className={!isEnabled ? "text-zinc-400" : ""}>
                    {k.label} ({provider?.name || "未知渠道"}){!isEnabled ? " (已停用)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 手填 / 下拉模型 ID */}
          <div className="space-y-1.5">
            <Label htmlFor="model-id">模型标识 (Model ID)</Label>
            <Input
              id="model-id"
              value={formData.model_id || ""}
              onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
              placeholder="例如: claude-3-5-sonnet-20241022"
              disabled={!!model?.id}
            />
          </div>

          {/* 历史与预设模型快捷点选 */}
          {!model?.id && (
            <div className="space-y-1.5">
              <div className="text-[12px] text-zinc-500 font-medium">快捷点选常用与历史模型：</div>
              <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-1 bg-zinc-50 rounded-lg border border-zinc-100">
                {allHistoryModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="text-[11px] px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-700 hover:border-[#D97757] hover:text-[#D97757] transition-colors font-mono"
                    onClick={() => setFormData({ ...formData, model_id: m, display_name: m })}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="model-display-name">展示友好名称 (可选)</Label>
            <Input
              id="model-display-name"
              value={formData.display_name || ""}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="例如: Claude 3.5 Sonnet"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label>是否启用该模型</Label>
            <Switch
              aria-label="是否启用模型"
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
