"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { AiProvider, AiProviderKey, AiConfigBundle, useAiConfig } from "../hooks/use-ai-config";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Pencil, Trash2, Plus, Server, AlertCircle } from "lucide-react";
import { presentError } from "@/lib/ai-config/presentation";

const defaultProviderForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProvider>;
const defaultKeyForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProviderKey>;
const providerDomainNames: Record<string, string> = {
  "openrouter.ai": "OpenRouter",
  "api.siliconflow.cn": "硅基流动",
  "api.deepseek.com": "DeepSeek",
  "dashscope.aliyuncs.com": "阿里云百炼",
  "aip.baidubce.com": "百度千帆",
};

function getProviderDomainMismatch(name: string, baseUrl: string): string {
  if (!name.trim() || !baseUrl.trim()) return "";
  let hostname = "";
  try {
    hostname = new URL(baseUrl.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
  const providerName = providerDomainNames[hostname];
  if (providerName && !name.toLowerCase().includes(providerName.toLowerCase())) {
    return `该地址属于 ${providerName} 官方 API，与当前服务商名称不符，请确认`;
  }
  return "";
}

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
  const [domainMismatchWarning, setDomainMismatchWarning] = useState("");

  useEffect(() => {
    setFormData(provider ? { ...defaultProviderForm, ...provider } : defaultProviderForm);
    setNameError("");
    setUrlError("");
    setDomainMismatchWarning("");
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{provider?.id ? "编辑渠道" : "新建渠道"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          <div className="space-y-2">
            <Label htmlFor="provider-name">渠道名称</Label>
            <Input
              id="provider-name"
              value={formData.name || ""}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (nameError) setNameError("");
                setDomainMismatchWarning(getProviderDomainMismatch(e.target.value, formData.base_url || ""));
              }}
              className={nameError ? "ring-1 ring-status-danger/40 border-status-danger/40" : ""}
              placeholder="例如: API中转站A / 官方OpenAI"
            />
            {nameError && <p className="text-status-danger text-[12px] mt-1">{nameError}</p>}
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
              onBlur={() => setDomainMismatchWarning(getProviderDomainMismatch(formData.name || "", formData.base_url || ""))}
              className={urlError ? "ring-1 ring-status-danger/40 border-status-danger/40" : ""}
              placeholder="例如: https://api.openai.com/v1"
            />
            {urlError && <p className="text-status-danger text-[12px] mt-1">{urlError}</p>}
            {domainMismatchWarning && <p className="text-[12px] text-[#B98A54] mt-1">{domainMismatchWarning}</p>}
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
        </DialogBody>
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

export function ProvidersManagerDialog({
  open,
  onOpenChange,
  onEditProvider,
  onCreateProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditProvider: (provider: AiProvider) => void;
  onCreateProvider: () => void;
}) {
  const { bundle, mutateEntity, mutate } = useAiConfig();
  const [error409Map, setError409Map] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    provider: AiProvider | null;
    keyCount: number;
    modelCount: number;
  }>({ open: false, provider: null, keyCount: 0, modelCount: 0 });
  const [pendingDeletion, setPendingDeletion] = useState<Set<string>>(new Set());
  const deletionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map()); // gate:transient-map 服务商删除5秒撤回定时器集合，随组件卸载释放

  useEffect(() => {
    const timers = deletionTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleToggle = async (provider: AiProvider, nextChecked: boolean) => {
    const res = await mutateEntity("update", "provider", { id: provider.id, is_enabled: nextChecked });
    if (res.ok) {
      feedbackToast.success(nextChecked ? `已启用服务商「${provider.name}」` : `已停用服务商「${provider.name}」`);
    }
  };

  const handleClickDelete = (provider: AiProvider) => {
    setError409Map((prev) => {
      const next = { ...prev };
      delete next[provider.id];
      return next;
    });
    const keys = bundle?.keys.filter((k) => k.provider_id === provider.id) ?? [];
    const keyIds = new Set(keys.map((k) => k.id));
    const modelCount = bundle?.models.filter((m) => keyIds.has(m.key_id)).length ?? 0;
    setConfirmDelete({ open: true, provider, keyCount: keys.length, modelCount });
  };

  const handleUndoDelete = (providerId: string) => {
    const timer = deletionTimers.current.get(providerId);
    if (timer) clearTimeout(timer);
    deletionTimers.current.delete(providerId);
    setPendingDeletion((prev) => {
      const next = new Set(prev);
      next.delete(providerId);
      return next;
    });
    feedbackToast.success("已撤回删除");
  };

  const handleExecuteDelete = () => {
    if (!confirmDelete.provider) return;
    const provider = confirmDelete.provider;
    setConfirmDelete({ open: false, provider: null, keyCount: 0, modelCount: 0 });
    setPendingDeletion((prev) => new Set(prev).add(provider.id));

    feedbackToast.warning(`已删除服务商「${provider.name}」，5 秒内可撤回`, {
      duration: 5000,
      action: {
        label: "撤回",
        onClick: () => handleUndoDelete(provider.id),
      },
    });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/ai-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", entity: "provider", data: { id: provider.id } }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          if (res.status === 409) {
            setError409Map((prev) => ({ ...prev, [provider.id]: data.error || "存在独占依赖，禁止删除" }));
          }
          throw new Error(data.error || "删除服务商失败");
        }
        mutate(data as AiConfigBundle);
        const cascade = data.cascade as { keyCount?: number; modelCount?: number } | undefined;
        const cascadeMsg = cascade ? `（后端已级联移除 ${cascade.keyCount ?? 0} 个密钥、${cascade.modelCount ?? 0} 个模型关联）` : "";
        feedbackToast.success(`已彻底删除服务商「${provider.name}」${cascadeMsg}`);
      } catch (err) {
        feedbackToast.error(presentError(err instanceof Error ? err.message : "", "删除服务商失败", "服务商"));
      } finally {
        setPendingDeletion((prev) => {
          const next = new Set(prev);
          next.delete(provider.id);
          return next;
        });
        deletionTimers.current.delete(provider.id);
      }
    }, 5000);

    deletionTimers.current.set(provider.id, timer);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-[#E2E2DF]">
            <DialogTitle className="text-[18px] font-medium text-[#141413]">渠道管理</DialogTitle>
            <Button size="s" onClick={onCreateProvider} className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal">
              <Plus className="size-3 mr-1" />新建服务商
            </Button>
          </DialogHeader>
          <DialogBody className="space-y-3 py-3 overflow-y-auto">
            {bundle?.providers.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[#A8A29E]">暂未配置服务商渠道</div>
            ) : (
              <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white">
                {bundle?.providers.map((p) => {
                  const keys = bundle.keys.filter((k) => k.provider_id === p.id);
                  const keyIds = new Set(keys.map((k) => k.id));
                  const modelCount = bundle.models.filter((m) => keyIds.has(m.key_id)).length;
                  const err409 = error409Map[p.id];
                  const isPending = pendingDeletion.has(p.id);
                  return (
                    <div key={p.id} className={cn("p-3 hover:bg-[#F7F7F6]/50 transition-colors", isPending && "opacity-40 pointer-events-none")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Server className="size-3.5 text-[#78716C]" />
                            <span className="text-[13px] font-medium text-[#141413] truncate">{p.name}</span>
                            {!p.is_enabled && <span className="text-[12px] px-1.5 py-0.5 rounded-md bg-[#EBEBE9] text-[#78716C]">已停用</span>}
                          </div>
                          <p className="text-[12px] font-mono text-[#78716C] truncate mt-0.5">{p.base_url}</p>
                          <p className="text-[12px] text-[#A8A29E] mt-0.5" title={keys.map((k) => k.label).join("、")}>{keys.length ? <span className="inline-block max-w-[220px] truncate align-bottom">{keys.map((k) => k.label).join("、")}</span> : "暂无密钥"} · {modelCount} 个模型</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] text-[#78716C]">{p.is_enabled ? "已启用" : "已停用"}</span>
                            <Switch aria-label="是否启用渠道" checked={p.is_enabled} onCheckedChange={(checked) => handleToggle(p, checked)} className="scale-75 origin-right" />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => onEditProvider(p)} className="size-7 text-[#78716C] hover:text-[#1F1E1D]" title="编辑服务商">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleClickDelete(p)} className="size-7 text-[#78716C] hover:text-[#C0685C]" title="删除服务商">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      {err409 && (
                        <div className="mt-2 flex items-center gap-1.5 p-2.5 rounded-md bg-[#C0685C]/8 border border-[#C0685C]/20 text-[12px] text-[#C0685C]">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>{err409}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="s" onClick={() => onOpenChange(false)} className="h-7 text-[12px] border-[#E2E2DF]">关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete.open} onOpenChange={(op) => setConfirmDelete((prev) => ({ ...prev, open: op }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px] text-[#141413]">删除服务商确认</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2 py-2">
            <p className="text-[13px] text-[#1F1E1D]">确定要删除服务商「{confirmDelete.provider?.name}」吗？</p>
            <p className="text-[12px] text-[#C0685C] bg-[#C0685C]/8 p-2.5 rounded-md border border-[#C0685C]/20">
              当前关联：包含 {confirmDelete.keyCount} 个密钥与 {confirmDelete.modelCount} 个模型配置。确定删除后将彻底移除该服务商及其全部关联配置。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="s" onClick={() => setConfirmDelete({ open: false, provider: null, keyCount: 0, modelCount: 0 })} className="h-7 text-[12px]">取消</Button>
            <Button size="s" onClick={handleExecuteDelete} className="h-7 text-[12px] bg-[#C0685C] hover:bg-[#C0685C]/90 text-white font-normal">
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{apiKey?.id ? "编辑分组密钥" : "新建分组密钥"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          <div className="space-y-2">
            <Label htmlFor="provider-select">所属渠道 (Provider)</Label>
            <select
              id="provider-select"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-[#E2E2DF] bg-[#FCFCFB]/50 text-[#1F1E1D] shadow-input"
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
            <Label htmlFor="key-label">专线分组名称</Label>
            <Input
              id="key-label"
              value={formData.label || ""}
              onChange={(e) => {
                setFormData({ ...formData, label: e.target.value });
                if (labelError) setLabelError("");
              }}
              className={labelError ? "ring-1 ring-status-danger/40 border-status-danger/40" : ""}
              placeholder="例如: claude、gemini、gpt、default"
            />
            {labelError && <p className="text-status-danger text-[12px] mt-1">{labelError}</p>}
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
              className={keyError ? "ring-1 ring-status-danger/40 border-status-danger/40" : ""}
              placeholder={apiKey?.id ? "留空表示不修改" : "sk-..."}
            />
            {keyError && <p className="text-status-danger text-[12px] mt-1">{keyError}</p>}
          </div>
          <div className="flex items-center justify-between">
            <Label>是否启用</Label>
            <Switch
              aria-label="是否启用分组密钥"
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
        </DialogBody>
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
