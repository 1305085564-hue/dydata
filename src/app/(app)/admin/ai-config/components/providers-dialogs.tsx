"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AiProvider, AiConfigBundle, useAiConfig } from "../hooks/use-ai-config";
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Pencil, Trash2, Plus, Server, AlertCircle } from "lucide-react";
import { presentError } from "@/lib/ai-config/presentation";
import { DangerousActionDialog, DangerousActionType } from "./dangerous-action-dialog";

const defaultProviderForm = { is_enabled: true, priority: 50 } satisfies Partial<AiProvider>;
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
    return `该地址属于 ${providerName} 官方 API，与当前接入点名称不符，请确认`;
  }
  return "";
}

export function ProviderQuickActionsDialog({
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
      setNameError("请输入接入点名称");
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[94vw] max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
        <DialogHeader className="gap-1.5 border-b border-[#E2E2DF]/60 pb-3">
          <DialogTitle className="text-[18px] font-medium text-[#141413]">
            {provider?.id ? "编辑接入点" : "新建接入点"}
          </DialogTitle>
          <p className="text-[12px] text-[#78716C] leading-relaxed">
            配置 AI 接入点与网络地址，渠道与模型将挂载于此接入点下。
          </p>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-3.5 overflow-y-auto py-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="provider-name" className="text-[12px] text-[#78716C]">
              接入点名称
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
                "h-8 text-[13px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]",
                nameError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/60"
              )}
              placeholder="例如: API中转站A / 官方OpenAI"
            />
            {nameError && <p className="text-[#C0685C] text-[12px] mt-1">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-base-url" className="text-[12px] text-[#78716C]">
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
                "h-8 text-[13px] font-mono border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]",
                urlError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/60"
              )}
              placeholder="例如: https://api.openai.com/v1"
            />
            {urlError && <p className="text-[#C0685C] text-[12px] mt-1">{urlError}</p>}
            {domainMismatchWarning && (
              <div className="mt-1 rounded-md border border-[#B98A54]/20 bg-[#B98A54]/8 p-2 text-[12px] text-[#B98A54] leading-relaxed">
                {domainMismatchWarning}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-description" className="text-[12px] text-[#78716C]">
              接入点说明 (可选)
            </Label>
            <Textarea
              id="provider-description"
              rows={2}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="填写此接入点的特点、费率或备用策略..."
              className="text-[13px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] px-3.5 py-2.5">
            <div>
              <Label className="text-[13px] font-normal text-[#1F1E1D]">是否启用此接入点</Label>
              <p className="mt-0.5 text-[12px] text-[#78716C]">停用后，系统将自动绕开此接入点下的全部渠道</p>
            </div>
            <Switch
              aria-label="是否启用接入点"
              checked={formData.is_enabled ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
          <Button
            variant="outline"
            size="s"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-7.5 px-3 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>
          <Button
            size="s"
            onClick={handleSubmit}
            disabled={loading}
            className="h-7.5 px-3.5 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
          >
            {loading ? "保存中…" : "保存接入点"}
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
  const { bundle, mutateEntity, mutate, checkDependencies } = useAiConfig();
  const [error409Map, setError409Map] = useState<Record<string, string>>({});
  const [dangerousAction, setDangerousAction] = useState<{
    open: boolean;
    actionType: DangerousActionType;
    provider: AiProvider | null;
    loading: boolean;
    isExecuting: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preview: any;
  }>({
    open: false,
    actionType: "disable_provider",
    provider: null,
    loading: false,
    isExecuting: false,
    preview: null,
  });

  const handleToggle = async (provider: AiProvider, nextChecked: boolean) => {
    if (nextChecked) {
      // 启用操作安全，直接执行
      const res = await mutateEntity("update", "provider", { id: provider.id, is_enabled: true });
      if (res.ok) {
        feedbackToast.success(`已启用接入点「${provider.name}」`);
      }
      return;
    }

    // 停用接入点是高风险动作，执行前核查依赖（B-2）
    setDangerousAction({
      open: true,
      actionType: "disable_provider",
      provider,
      loading: true,
      isExecuting: false,
      preview: null,
    });

    try {
      const preview = await checkDependencies({ scope: "provider", id: provider.id });
      setDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview,
      }));
    } catch {
      setDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: {
          ok: false,
          complete: false,
          unknownReasons: ["无法连接依赖检查接口"],
          criticalBindings: [],
          affectedBindings: [],
        },
      }));
    }
  };

  const handleClickDelete = async (provider: AiProvider) => {
    setError409Map((prev) => {
      const next = { ...prev };
      delete next[provider.id];
      return next;
    });

    // 删除接入点是高风险破坏性动作，执行前核查依赖（B-2）
    setDangerousAction({
      open: true,
      actionType: "delete_provider",
      provider,
      loading: true,
      isExecuting: false,
      preview: null,
    });

    try {
      const preview = await checkDependencies({ scope: "provider", id: provider.id });
      setDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview,
      }));
    } catch {
      setDangerousAction((prev) => ({
        ...prev,
        loading: false,
        preview: {
          ok: false,
          complete: false,
          unknownReasons: ["无法连接依赖检查接口"],
          criticalBindings: [],
          affectedBindings: [],
        },
      }));
    }
  };

  const handleConfirmDangerousAction = async () => {
    if (!dangerousAction.provider) return;
    const provider = dangerousAction.provider;

    setDangerousAction((prev) => ({ ...prev, isExecuting: true }));
    try {
      if (dangerousAction.actionType === "disable_provider") {
        const res = await mutateEntity("update", "provider", { id: provider.id, is_enabled: false });
        if (res.ok) {
          feedbackToast.success(`已停用接入点「${provider.name}」`);
          setDangerousAction((prev) => ({ ...prev, open: false }));
        } else {
          feedbackToast.error("停用接入点失败");
        }
      } else if (dangerousAction.actionType === "delete_provider") {
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
          throw new Error(data.error || "删除接入点失败");
        }
        mutate(data as AiConfigBundle);
        const cascade = data.cascade as { keyCount?: number; modelCount?: number } | undefined;
        const cascadeMsg = cascade ? `（已级联清除 ${cascade.keyCount ?? 0} 个渠道、${cascade.modelCount ?? 0} 个模型关联）` : "";
        feedbackToast.success(`已彻底删除接入点「${provider.name}」${cascadeMsg}`);
        setDangerousAction((prev) => ({ ...prev, open: false }));
      }
    } catch (err) {
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "操作失败", "接入点"));
    } finally {
      setDangerousAction((prev) => ({ ...prev, isExecuting: false }));
    }
  };

  const handleNarrowerAction = useCallback(async () => {
    if (!dangerousAction.provider) return;
    const provider = dangerousAction.provider;
    setDangerousAction((prev) => ({ ...prev, isExecuting: true }));
    try {
      if (dangerousAction.actionType === "delete_provider") {
        // 删改停：仅停用接入点
        const res = await mutateEntity("update", "provider", { id: provider.id, is_enabled: false });
        if (res.ok) {
          feedbackToast.success(`已停用接入点「${provider.name}」（保留所有历史渠道与模型数据）`);
          setDangerousAction((prev) => ({ ...prev, open: false }));
        }
      } else {
        // 关闭弹窗提示前往渠道视角
        setDangerousAction((prev) => ({ ...prev, open: false }));
        onOpenChange(false);
        feedbackToast.success("请在渠道视角管理单条渠道启用状态");
      }
    } finally {
      setDangerousAction((prev) => ({ ...prev, isExecuting: false }));
    }
  }, [dangerousAction.provider, dangerousAction.actionType, mutateEntity, onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] w-[94vw] max-w-xl flex-col rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-[#E2E2DF]/60 pb-3">
            <div>
              <DialogTitle className="text-[18px] font-medium text-[#141413]">接入点管理</DialogTitle>
              <p className="mt-0.5 text-[12px] text-[#78716C]">
                维护所有 AI 接入点与网络配置
              </p>
            </div>
            <Button
              size="s"
              onClick={onCreateProvider}
              className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              <Plus className="size-3 mr-1" />
              新建接入点
            </Button>
          </DialogHeader>
          <DialogBody className="space-y-3 py-2 overflow-y-auto">
            {bundle?.providers.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-[#A8A29E]">暂未配置接入资料</div>
            ) : (
              <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white shadow-card">
                {bundle?.providers.map((p) => {
                  const keys = bundle.keys.filter((k) => k.provider_id === p.id);
                  const keyIds = new Set(keys.map((k) => k.id));
                  const modelCount = bundle.models.filter((m) => keyIds.has(m.key_id)).length;
                  const err409 = error409Map[p.id];

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 hover:bg-[#F7F7F6]/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Server className="size-3.5 text-[#78716C]" />
                            <span className="text-[13px] font-medium text-[#141413] truncate">{p.name}</span>
                            {!p.is_enabled ? (
                              <span className="text-[12px] px-1.5 py-0.2 rounded-md bg-[#EBEBE9] text-[#78716C]">已停用</span>
                            ) : (
                              <span className="text-[12px] px-1.5 py-0.2 rounded-md bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20">已启用</span>
                            )}
                          </div>
                          <p className="text-[12px] font-mono text-[#78716C] truncate mt-0.5">{p.base_url}</p>
                          <div className="text-[12px] text-[#78716C] mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[#A8A29E]">挂载渠道:</span>
                            {keys.length ? (
                              <span className="text-[#1F1E1D] font-mono font-medium">
                                {keys.map((k) => k.label).join("、")}
                              </span>
                            ) : (
                              <span className="text-[#A8A29E]">暂无挂载渠道</span>
                            )}
                            <span className="text-[#E2E2DF]">·</span>
                            <span className="text-[#78716C]">{modelCount} 个模型已关联</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="flex items-center gap-1.5 mr-1">
                            <Switch
                              aria-label="是否启用接入点"
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
                            title="编辑接入点"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleClickDelete(p)}
                            className="size-7 text-[#78716C] hover:text-[#C0685C] hover:bg-[#C0685C]/10"
                            title="删除接入点"
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

      {/* 高风险动作执行前确认闸门（B-2 冻结裁决③） */}
      <DangerousActionDialog
        open={dangerousAction.open}
        onOpenChange={(op) => setDangerousAction((prev) => ({ ...prev, open: op }))}
        actionType={dangerousAction.actionType}
        targetName={dangerousAction.provider?.name || ""}
        loading={dangerousAction.loading}
        preview={dangerousAction.preview}
        onConfirm={handleConfirmDangerousAction}
        onNarrowerAction={handleNarrowerAction}
        narrowerActionLabel={
          dangerousAction.actionType === "delete_provider"
            ? "仅停用接入点（保留配置）"
            : "前往渠道视角管理单条渠道"
        }
        narrowerActionDescription={
          dangerousAction.actionType === "delete_provider"
            ? "如果只是暂时停止服务，建议「仅停用接入点」，避免丢失渠道与挂载模型的数据："
            : "如果只是某条线路异常，建议前往渠道视角单独关闭该渠道，避免影响其他正常渠道："
        }
        confirmButtonLabel={
          dangerousAction.actionType === "delete_provider"
            ? "确认彻底删除接入点"
            : "确认停用接入点"
        }
        isExecuting={dangerousAction.isExecuting}
      />
    </>
  );
}
