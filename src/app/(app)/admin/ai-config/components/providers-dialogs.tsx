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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      setNameError("请输入渠道名称");
      hasError = true;
    } else {
      setNameError("");
    }
    if (!formData.base_url?.trim()) {
      setUrlError("请输入 Base URL");
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[94vw] max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 sm:p-7 shadow-claude-dialog">
        <DialogHeader className="gap-1.5 border-b border-[#E2E2DF]/60 pb-4">
          <DialogTitle className="text-[18px] font-medium text-[#141413]">
            {provider?.id ? "编辑渠道服务商" : "新建渠道服务商"}
          </DialogTitle>
          <p className="text-[12px] text-[#78716C] leading-relaxed">
            配置 AI 供应商的接入点与物理网络地址，密钥与模型将挂载于此渠道下。
          </p>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-5 overflow-y-auto py-3">
          <div className="space-y-2">
            <Label htmlFor="provider-name" className="text-[13px] font-medium text-[#141413]">
              渠道名称
            </Label>
            <Input
              id="provider-name"
              value={formData.name || ""}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (nameError) setNameError("");
                setDomainMismatchWarning(getProviderDomainMismatch(e.target.value, formData.base_url || ""));
              }}
              className={cn(
                "h-8.5 text-[13px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]",
                nameError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/60"
              )}
              placeholder="例如: API中转站A / 官方OpenAI"
            />
            {nameError && <p className="text-[#C0685C] text-[12px] mt-1">{nameError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-base-url" className="text-[13px] font-medium text-[#141413]">
              Base URL
            </Label>
            <Input
              id="provider-base-url"
              value={formData.base_url || ""}
              onChange={(e) => {
                setFormData({ ...formData, base_url: e.target.value });
                if (urlError) setUrlError("");
              }}
              onBlur={() => setDomainMismatchWarning(getProviderDomainMismatch(formData.name || "", formData.base_url || ""))}
              className={cn(
                "h-8.5 text-[13px] font-mono border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]",
                urlError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/60"
              )}
              placeholder="例如: https://api.openai.com/v1"
            />
            {urlError && <p className="text-[#C0685C] text-[12px] mt-1">{urlError}</p>}
            {domainMismatchWarning && (
              <div className="mt-1.5 rounded-md border border-[#B98A54]/20 bg-[#B98A54]/8 p-2.5 text-[12px] text-[#B98A54] leading-relaxed">
                {domainMismatchWarning}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-description" className="text-[13px] font-medium text-[#141413]">
              渠道特点与说明 (可选)
            </Label>
            <Textarea
              id="provider-description"
              rows={2}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="填写此渠道的特点、费率或备用策略..."
              className="text-[13px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E2E2DF] bg-[#FAF9F6] px-4 py-3">
            <div>
              <Label className="text-[13px] font-medium text-[#141413]">是否启用此渠道</Label>
              <p className="mt-0.5 text-[12px] text-[#78716C]">停用后，系统将自动绕开此渠道下的全部密钥</p>
            </div>
            <Switch
              aria-label="是否启用渠道"
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-4">
          <Button
            variant="outline"
            size="default"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-8 px-3.5 text-[13px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>
          <Button
            size="default"
            onClick={handleSubmit}
            disabled={loading}
            className="h-8 px-4 text-[13px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
          >
            {loading ? "保存中…" : "保存渠道"}
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
      feedbackToast.success(nextChecked ? `已启用渠道「${provider.name}」` : `已停用渠道「${provider.name}」`);
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

    feedbackToast.warning(`已删除渠道「${provider.name}」，5 秒内可撤回`, {
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
          throw new Error(data.error || "删除渠道失败");
        }
        mutate(data as AiConfigBundle);
        const cascade = data.cascade as { keyCount?: number; modelCount?: number } | undefined;
        const cascadeMsg = cascade ? `（已级联移除 ${cascade.keyCount ?? 0} 个密钥、${cascade.modelCount ?? 0} 个模型关联）` : "";
        feedbackToast.success(`已彻底删除渠道「${provider.name}」${cascadeMsg}`);
      } catch (err) {
        feedbackToast.error(presentError(err instanceof Error ? err.message : "", "删除渠道失败", "服务商"));
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
        <DialogContent className="flex max-h-[85vh] w-[94vw] max-w-xl flex-col rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-[#E2E2DF]/60 pb-3">
            <div>
              <DialogTitle className="text-[18px] font-medium text-[#141413]">渠道管理</DialogTitle>
              <p className="mt-0.5 text-[12px] text-[#78716C]">
                维护所有 AI 服务商物理接入点与基础网络配置
              </p>
            </div>
            <Button
              size="s"
              onClick={onCreateProvider}
              className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              <Plus className="size-3 mr-1" />
              新建渠道
            </Button>
          </DialogHeader>
          <DialogBody className="space-y-3 py-2 overflow-y-auto">
            {bundle?.providers.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-[#A8A29E]">暂未配置服务商渠道</div>
            ) : (
              <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white shadow-card">
                {bundle?.providers.map((p) => {
                  const keys = bundle.keys.filter((k) => k.provider_id === p.id);
                  const keyIds = new Set(keys.map((k) => k.id));
                  const modelCount = bundle.models.filter((m) => keyIds.has(m.key_id)).length;
                  const err409 = error409Map[p.id];
                  const isPending = pendingDeletion.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "p-3.5 hover:bg-[#F7F7F6]/50 transition-colors",
                        isPending && "opacity-40 pointer-events-none"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Server className="size-3.5 text-[#78716C]" />
                            <span className="text-[13px] font-medium text-[#141413] truncate">{p.name}</span>
                            {!p.is_enabled ? (
                              <span className="text-[12px] px-1.5 py-0.2 rounded-md bg-[#EBEBE9] text-[#78716C]">已停用</span>
                            ) : (
                              <span className="text-[12px] px-1.5 py-0.2 rounded-md bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20">现役</span>
                            )}
                          </div>
                          <p className="text-[12px] font-mono text-[#78716C] truncate mt-0.5">{p.base_url}</p>
                          <div className="text-[12px] text-[#78716C] mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[#A8A29E]">专线分组:</span>
                            {keys.length ? (
                              <span className="text-[#1F1E1D] font-mono font-medium">
                                {keys.map((k) => k.label).join("、")}
                              </span>
                            ) : (
                              <span className="text-[#A8A29E]">暂无分组密钥</span>
                            )}
                            <span className="text-[#E2E2DF]">·</span>
                            <span className="text-[#78716C]">{modelCount} 个模型已关联</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="flex items-center gap-1.5 mr-1">
                            <Switch
                              aria-label="是否启用渠道"
                              checked={p.is_enabled}
                              onCheckedChange={(checked) => handleToggle(p, checked)}
                              className="scale-75 origin-right"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEditProvider(p)}
                            className="size-7 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                            title="编辑服务商"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleClickDelete(p)}
                            className="size-7 text-[#78716C] hover:text-[#C0685C] hover:bg-[#C0685C]/10"
                            title="删除服务商"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      {err409 && (
                        <div className="mt-2.5 flex items-center gap-1.5 p-2 rounded-md bg-[#C0685C]/8 border border-[#C0685C]/20 text-[12px] text-[#C0685C]">
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
          <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
            <Button
              variant="outline"
              size="s"
              onClick={() => onOpenChange(false)}
              className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete.open} onOpenChange={(op) => setConfirmDelete((prev) => ({ ...prev, open: op }))}>
        <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader className="gap-1 border-b border-[#E2E2DF]/60 pb-3">
            <DialogTitle className="text-[18px] font-medium text-[#141413]">删除渠道确认</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3 py-2">
            <p className="text-[13px] text-[#1F1E1D]">确定要彻底删除渠道「{confirmDelete.provider?.name}」吗？</p>
            <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/8 p-3 text-[12px] text-[#C0685C] leading-relaxed">
              当前关联包含 {confirmDelete.keyCount} 个分组密钥与 {confirmDelete.modelCount} 个模型配置。删除后将一并解除所有关联。
            </div>
          </DialogBody>
          <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
            <Button
              variant="outline"
              size="s"
              onClick={() => setConfirmDelete({ open: false, provider: null, keyCount: 0, modelCount: 0 })}
              className="h-7 text-[12px] border-[#E2E2DF]"
            >
              取消
            </Button>
            <Button
              size="s"
              onClick={handleExecuteDelete}
              className="h-7 text-[12px] bg-[#C0685C] hover:bg-[#C0685C]/90 text-white font-normal"
            >
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
      setLabelError("请输入专线分组名称");
      hasError = true;
    } else {
      setLabelError("");
    }
    if (!apiKey?.id && !apiKeyValue.trim()) {
      setKeyError("请输入 API Key");
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[94vw] max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 sm:p-7 shadow-claude-dialog">
        <DialogHeader className="gap-1.5 border-b border-[#E2E2DF]/60 pb-4">
          <DialogTitle className="text-[18px] font-medium text-[#141413]">
            {apiKey?.id ? "编辑专线分组密钥" : "新建专线分组密钥"}
          </DialogTitle>
          <p className="text-[12px] text-[#78716C] leading-relaxed">
            专线分组用于将渠道内的算力精确划分至对应模型系列（如 claude, gemini, gpt, default）。
          </p>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-5 overflow-y-auto py-3">
          <div className="space-y-2">
            <Label htmlFor="provider-select" className="text-[13px] font-medium text-[#141413]">
              所属渠道 (Provider)
            </Label>
            <Select
              value={selectedProviderId}
              onValueChange={(val) => val && setSelectedProviderId(val)}
            >
              <SelectTrigger
                id="provider-select"
                aria-label="所属渠道"
                className="h-8.5 w-full rounded-md border border-[#E2E2DF] bg-white px-3 text-[13px] text-[#1F1E1D] shadow-input transition-colors focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
              >
                <SelectValue placeholder="选择所属渠道" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-[#E2E2DF] bg-white text-[13px] shadow-claude-float p-1">
                {bundle?.providers.map((p) => (
                  <SelectItem
                    key={p.id}
                    value={p.id}
                    disabled={!p.is_enabled}
                    className="py-2"
                  >
                    {p.name} ({p.base_url}){!p.is_enabled ? " (已停用)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="key-label" className="text-[13px] font-medium text-[#141413]">
                专线分组名称
              </Label>
              <div className="flex items-center gap-1">
                {["claude", "gemini", "gpt", "default"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFormData({ ...formData, label: preset })}
                    className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-[#F1F1F0] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <Input
              id="key-label"
              value={formData.label || ""}
              onChange={(e) => {
                setFormData({ ...formData, label: e.target.value });
                if (labelError) setLabelError("");
              }}
              className={cn(
                "h-8.5 text-[13px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]",
                labelError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/60"
              )}
              placeholder="例如: claude、gemini、gpt、default"
            />
            {labelError && <p className="text-[#C0685C] text-[12px] mt-1">{labelError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-[13px] font-medium text-[#141413]">
              API Key 授权凭据
            </Label>
            <Input
              id="api-key"
              type="password"
              value={apiKeyValue}
              onChange={(e) => {
                setApiKeyValue(e.target.value);
                if (keyError) setKeyError("");
              }}
              onBlur={() => setApiKeyValue((val) => val.trim())}
              className={cn(
                "h-8.5 text-[13px] font-mono border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]",
                keyError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/60"
              )}
              placeholder={apiKey?.id ? "留空表示不修改现有密钥" : "sk-..."}
            />
            {keyError && <p className="text-[#C0685C] text-[12px] mt-1">{keyError}</p>}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E2E2DF] bg-[#FAF9F6] px-4 py-3">
            <div>
              <Label className="text-[13px] font-medium text-[#141413]">是否启用此分组</Label>
              <p className="mt-0.5 text-[12px] text-[#78716C]">停用后，调度器将跳过该专线分组</p>
            </div>
            <Switch
              aria-label="是否启用分组"
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="key-priority" className="text-[13px] font-medium text-[#141413]">
                顺位优先级
              </Label>
              <span className="text-[12px] text-[#78716C]">数字越小越优先调度，1 为首选</span>
            </div>
            <Input
              id="key-priority"
              type="number"
              min={1}
              max={999}
              value={formData.priority ?? 50}
              onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 50 })}
              className="h-8.5 text-[13px] border-[#E2E2DF] text-[#1F1E1D]"
            />
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-4">
          <Button
            variant="outline"
            size="default"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-8 px-3.5 text-[13px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>
          <Button
            size="default"
            onClick={handleSubmit}
            disabled={loading}
            className="h-8 px-4 text-[13px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
          >
            {loading ? "保存中…" : "保存分组密钥"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
