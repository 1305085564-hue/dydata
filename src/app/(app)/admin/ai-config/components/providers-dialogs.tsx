"use client";

import { useEffect, useMemo, useState } from "react";
import { AiProvider, AiProviderKey, AiProviderKeyModel, useAiConfig } from "../hooks/use-ai-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const defaultProviderForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProvider>;
const defaultKeyForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProviderKey>;
const defaultModelForm = { is_enabled: true } satisfies Partial<AiProviderKeyModel>;

// 2026 最新主流大模型预设库
const LATEST_2026_MODEL_GROUPS = [
  {
    groupName: "DeepSeek 系列 (2026)",
    items: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (1M上下文)" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-chat", name: "DeepSeek V3" },
      { id: "deepseek-reasoner", name: "DeepSeek R1 (深度推理)" },
    ],
  },
  {
    groupName: "OpenAI / ChatGPT (2026)",
    items: [
      { id: "gpt-5.6-sol", name: "GPT-5.6 Sol (旗舰全能)" },
      { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "o3-mini", name: "OpenAI o3-mini" },
      { id: "o1", name: "OpenAI o1" },
    ],
  },
  {
    groupName: "Claude 系列 (2026)",
    items: [
      { id: "claude-5-opus", name: "Claude 5 Opus (最强编程)" },
      { id: "claude-5-sonnet", name: "Claude 5 Sonnet" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    ],
  },
  {
    groupName: "Google & 国产主流 (2026)",
    items: [
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
      { id: "qwen-3.8-max", name: "通义千问 3.8-Max" },
      { id: "kimi-k1.5", name: "Kimi K1.5" },
    ],
  },
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
  const [nameError, setNameError] = useState("");
  const [urlError, setUrlError] = useState("");

  useEffect(() => {
    setFormData(provider ? { ...defaultProviderForm, ...provider } : defaultProviderForm);
    setNameError("");
    setUrlError("");
  }, [provider, open]);

  const handleSubmit = async () => {
    let hasError = false;
    if (!formData.name?.trim()) {
      setNameError("输入渠道名称");
      hasError = true;
    } else {
      setNameError("");
    }
    if (!formData.base_url?.trim()) {
      setUrlError("输入 Base URL");
      hasError = true;
    } else {
      setUrlError("");
    }
    if (hasError) return;

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
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (nameError) setNameError("");
              }}
              className={nameError ? "ring-1 ring-red-300 border-red-300" : ""}
              placeholder="例如: API中转站A / 官方OpenAI"
            />
            {nameError && <p className="text-[#C0685C] text-xs mt-1">{nameError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              value={formData.base_url || ""}
              onChange={(e) => {
                setFormData({ ...formData, base_url: e.target.value });
                if (urlError) setUrlError("");
              }}
              className={urlError ? "ring-1 ring-red-300 border-red-300" : ""}
              placeholder="例如: https://api.openai.com/v1"
            />
            {urlError && <p className="text-[#C0685C] text-xs mt-1">{urlError}</p>}
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
  const [labelError, setLabelError] = useState("");
  const [keyError, setKeyError] = useState("");

  useEffect(() => {
    setFormData(apiKey ? { ...defaultKeyForm, ...apiKey } : defaultKeyForm);
    setSelectedProviderId(providerId || apiKey?.provider_id || bundle?.providers[0]?.id || "");
    setApiKeyValue("");
    setLabelError("");
    setKeyError("");
  }, [apiKey, providerId, open, bundle]);

  const handleSubmit = async () => {
    let hasError = false;
    if (!formData.label?.trim()) {
      setLabelError("输入名称");
      hasError = true;
    } else {
      setLabelError("");
    }
    if (!apiKey?.id && !apiKeyValue.trim()) {
      setKeyError("输入 API Key");
      hasError = true;
    } else {
      setKeyError("");
    }
    if (hasError) return;

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
              className="w-full h-9 px-3 text-[13px] rounded-md border border-[#E5E0D6] bg-white"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
            >
              {bundle?.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.is_enabled} className={!p.is_enabled ? "text-[#78716C]" : ""}>
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
              onChange={(e) => {
                setFormData({ ...formData, label: e.target.value });
                if (labelError) setLabelError("");
              }}
              className={labelError ? "ring-1 ring-red-300 border-red-300" : ""}
              placeholder="例如: 主账号-Key1"
            />
            {labelError && <p className="text-[#C0685C] text-xs mt-1">{labelError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKeyValue}
              onChange={(e) => {
                setApiKeyValue(e.target.value);
                if (keyError) setKeyError("");
              }}
              className={keyError ? "ring-1 ring-red-300 border-red-300" : ""}
              placeholder={apiKey?.id ? "留空表示不修改" : "sk-..."}
            />
            {keyError && <p className="text-[#C0685C] text-xs mt-1">{keyError}</p>}
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
  const [presetTab, setPresetTab] = useState<"used" | "latest">("used");
  const [loading, setLoading] = useState(false);
  const [modelIdError, setModelIdError] = useState("");

  // 自动搜集全站当前已配置的型号（去重）
  const usedModels = useMemo(() => {
    if (!bundle) return [];
    const set = new Set<string>();
    bundle.models.forEach((m) => {
      if (m.model_id) set.add(m.model_id);
    });
    return Array.from(set).sort();
  }, [bundle]);

  useEffect(() => {
    setFormData(
      model
        ? { ...defaultModelForm, ...model }
        : { ...defaultModelForm, model_id: initialModelId || "", display_name: null }
    );
    setSelectedKeyId(keyId || bundle?.keys[0]?.id || "");
    setModelIdError("");
  }, [model, keyId, initialModelId, open, bundle]);

  const handleSubmit = async () => {
    if (!formData.model_id?.trim()) {
      setModelIdError("输入型号标识");
      return;
    }
    setModelIdError("");
    setLoading(true);
    try {
      await onSave({
        ...formData,
        display_name: null,
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
          <DialogTitle>{model?.id ? "编辑型号" : "接入新型号"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-3">
          {/* 选择绑定的 Key */}
          <div className="space-y-1.5">
            <Label htmlFor="model-key-select">目标渠道密钥</Label>
            <select
              id="model-key-select"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-[#E5E0D6] bg-white text-[#292524]"
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
            >
              {bundle?.keys.map((k) => {
                const provider = bundle.providers.find((p) => p.id === k.provider_id);
                const isEnabled = k.is_enabled && (provider ? provider.is_enabled : true);
                return (
                  <option key={k.id} value={k.id} disabled={!isEnabled} className={!isEnabled ? "text-[#78716C]" : ""}>
                    {k.label} ({provider?.name || "未知渠道"}){!isEnabled ? " (已停用)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 手填 / 下拉模型 ID */}
          <div className="space-y-1.5">
            <Label htmlFor="model-id">型号正名 (Model ID)</Label>
            <Input
              id="model-id"
              value={formData.model_id || ""}
              onChange={(e) => {
                setFormData({ ...formData, model_id: e.target.value });
                if (modelIdError) setModelIdError("");
              }}
              className={modelIdError ? "ring-1 ring-red-300 border-red-300 font-mono text-[13px]" : "font-mono text-[13px]"}
              placeholder="例如: gemini-2.5-flash / deepseek-chat / gpt-4o"
              disabled={!!model?.id}
            />
            {modelIdError && <p className="text-[#C0685C] text-xs mt-1">{modelIdError}</p>}
          </div>

          {/* 快捷点选: 常用已用模型 VS 主流预设 */}
          {!model?.id && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#78716C]">快速选填常见型号：</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "px-2.5 py-1 text-[12px] rounded-lg transition-all cursor-pointer font-medium",
                      presetTab === "used" ? "bg-[#D97757]/10 text-[#D97757]" : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
                    )}
                    onClick={() => setPresetTab("used")}
                  >
                    📌 已接入型号 ({usedModels.length})
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "px-2.5 py-1 text-[12px] rounded-lg transition-all cursor-pointer font-medium",
                      presetTab === "latest" ? "bg-[#D97757]/10 text-[#D97757]" : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
                    )}
                    onClick={() => setPresetTab("latest")}
                  >
                    ⚡ 主流预设
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[160px] overflow-y-auto p-2 bg-[#FBF9F5]/80 rounded-xl border border-[#E5E0D6]/60">
                {presetTab === "used" ? (
                  usedModels.length === 0 ? (
                    <div className="text-center py-4 text-[12px] text-[#78716C]">还没记录过型号，需要时可切到【主流预设】选填</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {usedModels.map((mId) => (
                        <button
                          key={mId}
                          type="button"
                          className="font-mono text-[12px] px-2.5 py-1 rounded-md bg-white border border-[#E5E0D6] text-[#292524] hover:border-[#D97757] hover:text-[#D97757] active:scale-[0.985] active:duration-75 transition-all shadow-2xs"
                          onClick={() => setFormData({ ...formData, model_id: mId })}
                        >
                          {mId}
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  LATEST_2026_MODEL_GROUPS.map((group) => (
                    <div key={group.groupName} className="space-y-1">
                      <div className="text-[11px] font-medium text-[#78716C] tracking-wide">{group.groupName}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="font-mono text-[12px] px-2.5 py-1 rounded-md bg-white border border-[#E5E0D6] text-[#292524] hover:border-[#D97757] hover:text-[#D97757] active:scale-[0.985] active:duration-75 transition-all shadow-2xs"
                            onClick={() => setFormData({ ...formData, model_id: item.id })}
                          >
                            {item.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Label>是否启用该型号</Label>
            <Switch
              aria-label="是否启用型号"
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
