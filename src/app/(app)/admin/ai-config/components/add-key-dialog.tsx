"use client";

import { useEffect, useState } from "react";
import { useAiConfig, type AiConfigBundle } from "../hooks/use-ai-config";
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
import { feedbackToast } from "@/components/ui/feedback-toast";
import { presentError } from "@/lib/ai-config/presentation";
import { Loader2, ArrowLeft } from "lucide-react";
import { ShelfModelsPicker, type DiscoveredModelItem } from "./shelf-models-dialog";

interface AddKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId?: string | null;
  onSuccess?: (keyId: string) => void;
}

export function AddKeyDialog({
  open,
  onOpenChange,
  providerId,
  onSuccess,
}: AddKeyDialogProps) {
  const { bundle, mutate } = useAiConfig();

  const [step, setStep] = useState<"input" | "explore">("input");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [priority, setPriority] = useState<number>(50);
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [keyError, setKeyError] = useState("");

  // 探索模型列表与选中项
  const [activeInheritedModels, setActiveInheritedModels] = useState<DiscoveredModelItem[]>([]);
  const [otherDiscoveredModels, setOtherDiscoveredModels] = useState<DiscoveredModelItem[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [isProbeSuccess, setIsProbeSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("input");
      setSelectedProviderId(
        providerId || bundle?.providers.find((p) => p.is_enabled)?.id || bundle?.providers[0]?.id || ""
      );
      setLabel("");
      setApiKey("");
      setPriority(50);
      setLabelError("");
      setKeyError("");
      setActiveInheritedModels([]);
      setOtherDiscoveredModels([]);
      setSelectedModelIds(new Set());
      setIsProbeSuccess(false);
    }
  // Reset only when entering the dialog; background bundle updates must not erase form input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, providerId]);

  const handleProbeAndExplore = async () => {
    let hasErr = false;
    if (!label.trim()) {
      setLabelError("请输入密钥标签名称");
      hasErr = true;
    } else {
      setLabelError("");
    }
    if (!apiKey.trim()) {
      setKeyError("请输入 API Key");
      hasErr = true;
    } else {
      setKeyError("");
    }
    if (hasErr) return;

    setProbing(true);
    let probeOk = false;
    try {
      const provider = bundle?.providers.find((p) => p.id === selectedProviderId);
      let discoveredIds: string[] = [];

      // 1. 尝试直接探测上游支持的模型
      if (provider?.base_url) {
        try {
          const cleanUrl = provider.base_url.replace(/\/+$/, "");
          const targetUrl = cleanUrl.endsWith("/models") ? cleanUrl : `${cleanUrl}/models`;
          const res = await fetch(targetUrl, {
            headers: { Authorization: `Bearer ${apiKey.trim()}` },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const json = await res.json();
            const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
            const ids = [
              ...new Set(list.map((item: { id?: string }) => item?.id?.trim()).filter(Boolean)),
            ] as string[];
            if (ids.length > 0) {
              discoveredIds = ids;
              probeOk = true;
            }
          }
        } catch {
          // 上游不可直接跨域探测，使用系统已知模型备选
        }
      }

      // 2. 如果上游直接探测未获结果，继承该渠道已探明模型或系统已知模型作为候选
      if (!probeOk) {
        const knownKeys = bundle?.keys.filter((k) => k.provider_id === selectedProviderId) ?? [];
        const knownFromKeys = knownKeys.flatMap((k) => (k as unknown as { available_models?: string[] }).available_models ?? []);
        const knownFromModels =
          bundle?.models
            .filter((m) => knownKeys.some((k) => k.id === m.key_id))
            .map((m) => m.model_id) ?? [];
        discoveredIds = [...new Set([...knownFromKeys, ...knownFromModels])];
      }

      // 3. 如果依然为空，补充全站现役模型作为候选
      if (!probeOk && discoveredIds.length === 0 && bundle) {
        discoveredIds = [...new Set(bundle.models.map((m) => m.model_id))];
      }

      setIsProbeSuccess(probeOk);

      // 全站现役在用模型 ID 集合 (is_enabled === true)
      const activeGlobalModelIds = new Set(
        bundle?.models.filter((m) => m.is_enabled).map((m) => m.model_id) ?? []
      );

      const activeList: DiscoveredModelItem[] = [];
      const otherList: DiscoveredModelItem[] = [];
      const initialSelected = new Set<string>();

      for (const id of discoveredIds) {
        const matched = bundle?.models.find((m) => m.model_id === id);
        const displayName = matched?.display_name || id;
        const item = { modelId: id, displayName };

        if (activeGlobalModelIds.has(id)) {
          activeList.push(item);
          initialSelected.add(id); // 现役模型自动继承预勾选
        } else {
          otherList.push(item);
        }
      }

      // 确保全站现役模型全部出现在区一，避免探测遗漏
      for (const activeId of activeGlobalModelIds) {
        if (!discoveredIds.includes(activeId)) {
          const matched = bundle?.models.find((m) => m.model_id === activeId);
          activeList.push({ modelId: activeId, displayName: matched?.display_name || activeId });
          initialSelected.add(activeId);
        }
      }

      setActiveInheritedModels(activeList);
      setOtherDiscoveredModels(otherList);
      setSelectedModelIds(initialSelected);
      setStep("explore");
    } finally {
      setProbing(false);
    }
  };

  const handleToggleModel = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const handleSubmitKey = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          entity: "key",
          data: {
            provider_id: selectedProviderId,
            label: label.trim(),
            api_key: apiKey.trim(),
            priority,
            is_enabled: true,
            selectedModelIds: Array.from(selectedModelIds),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "创建密钥失败");
      }

      mutate(data as AiConfigBundle);
      onOpenChange(false);
      feedbackToast.success(
        `已接入密钥，并上架 ${selectedModelIds.size} 个模型（其余存入仓库）`
      );

      const newKey = (data.keys as Array<{ id: string; label: string }> | undefined)?.find(
        (k) => k.label === label.trim()
      );
      if (newKey && onSuccess) {
        onSuccess(newKey.id);
      }
    } catch (err) {
      feedbackToast.error(presentError(err instanceof Error ? err.message : "", "创建密钥失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "input" ? "接入新渠道密钥" : `探索并上架模型 · ${label}`}
          </DialogTitle>
        </DialogHeader>

        {step === "input" ? (
          <>
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="provider-select" className="text-[12px] text-[#78716C]">
                  渠道服务商
                </Label>
                <select
                  id="provider-select"
                  value={selectedProviderId}
                  onChange={(e) => setSelectedProviderId(e.target.value)}
                  className="w-full h-8 px-2.5 text-[13px] rounded-md border border-[#E2E2DF] bg-white text-[#1F1E1D] shadow-input focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                >
                  {bundle?.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {!p.is_enabled ? "(已停用)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="key-label" className="text-[12px] text-[#78716C]">
                  密钥标签名称
                </Label>
                <Input
                  id="key-label"
                  placeholder="例如: 火山方舟-主力-01 / 官方中转"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    if (labelError) setLabelError("");
                  }}
                  className="h-8 text-[13px] border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]"
                />
                {labelError && <p className="text-[12px] text-[#C0685C]">{labelError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-key" className="text-[12px] text-[#78716C]">
                  API Key
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (keyError) setKeyError("");
                  }}
                  onBlur={() => setApiKey((value) => value.trim())}
                  className="h-8 text-[13px] font-mono border-[#E2E2DF] text-[#1F1E1D] placeholder:text-[#A8A29E]"
                />
                {keyError && <p className="text-[12px] text-[#C0685C]">{keyError}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="priority" className="text-[12px] text-[#78716C]">
                    调度顺位优先级
                  </Label>
                  <span className="text-[12px] text-[#78716C]">数字越小越优先调度</span>
                </div>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={999}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) || 50)}
                  className="h-8 text-[13px] border-[#E2E2DF] text-[#1F1E1D]"
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                variant="outline"
                size="s"
                onClick={() => onOpenChange(false)}
                disabled={probing}
                className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
              >
                取消
              </Button>
              <Button
                size="s"
                onClick={handleProbeAndExplore}
                disabled={probing}
                className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
              >
                {probing && <Loader2 className="size-3 animate-spin mr-1 text-white" />}
                {probing ? "正在探测…" : "探测上游模型"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="space-y-3 py-1">
              <ShelfModelsPicker
                activeInheritedModels={activeInheritedModels}
                otherDiscoveredModels={otherDiscoveredModels}
                selectedModelIds={selectedModelIds}
                onToggleModel={handleToggleModel}
                isProbeSuccess={isProbeSuccess}
              />
            </DialogBody>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="s"
                onClick={() => setStep("input")}
                disabled={loading}
                className="h-7 text-[12px] text-[#78716C] hover:text-[#141413] px-2"
              >
                <ArrowLeft className="size-3 mr-1" />
                返回上一步
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="s"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
                >
                  取消
                </Button>
                <Button
                  size="s"
                  onClick={handleSubmitKey}
                  disabled={loading}
                  className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
                >
                  {loading && <Loader2 className="size-3 animate-spin mr-1 text-white" />}
                  确认接入并上架勾选的 {selectedModelIds.size} 个模型
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
