"use client";

import { useEffect, useState } from "react";
import { useAiConfig } from "../hooks/use-ai-config";
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
import { Checkbox } from "@/components/ui/checkbox";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Loader2 } from "lucide-react";

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
  const { bundle, mutateEntity, syncKeyModelsAuto } = useAiConfig();

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [priority, setPriority] = useState<number>(50);
  const [autoSyncModels, setAutoSyncModels] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [keyError, setKeyError] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedProviderId(
        providerId || bundle?.providers.find((p) => p.is_enabled)?.id || bundle?.providers[0]?.id || ""
      );
      setLabel("");
      setApiKey("");
      setPriority(50);
      setAutoSyncModels(true);
      setLabelError("");
      setKeyError("");
    }
  }, [open, providerId, bundle]);

  const handleSave = async () => {
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

    setLoading(true);
    try {
      // 1. 创建密钥
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
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "创建密钥失败");
      }

      // 找到新创建的 Key
      const newKey = (data.keys as Array<{ id: string; label: string }> | undefined)?.find(
        (k) => k.label === label.trim()
      );
      const newKeyId = newKey?.id;

      // 2. 如果勾选了"自动同步模型"
      let newModelCount = 0;
      if (autoSyncModels && newKeyId) {
        const syncResult = await syncKeyModelsAuto(newKeyId);
        newModelCount = syncResult?.newModels?.length ?? 0;
      }

      onOpenChange(false);

      if (newModelCount > 0) {
        feedbackToast.success(`已添加密钥并启用 ${newModelCount} 个推荐模型`, {
          action: newKeyId
            ? {
                label: "查看",
                onClick: () => {
                  const el = document.querySelector(`[data-key-id="${newKeyId}"]`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                },
              }
            : undefined,
        });
      } else {
        feedbackToast.success("已添加 API 密钥");
      }

      if (newKeyId && onSuccess) {
        onSuccess(newKeyId);
      }
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "创建密钥失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>接入新 API 密钥渠道</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-key-provider">所属供应商 / 渠道 (Provider)</Label>
            <select
              id="add-key-provider"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-[#E2E2DF] bg-white text-[#1F1E1D] shadow-input focus:outline-none focus:border-[#D97757]"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
            >
              {bundle?.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.is_enabled}>
                  {p.name} ({p.base_url}){!p.is_enabled ? " (已停用)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-key-label">密钥名称 / 标识</Label>
            <Input
              id="add-key-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (labelError) setLabelError("");
              }}
              placeholder="例如: 硅基流动-主Key / 中转站A"
              className={labelError ? "border-status-danger ring-1 ring-status-danger/30" : ""}
            />
            {labelError && <p className="text-[12px] text-status-danger">{labelError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-key-token">API Key 凭据</Label>
            <Input
              id="add-key-token"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (keyError) setKeyError("");
              }}
              placeholder="sk-..."
              className={keyError ? "border-status-danger ring-1 ring-status-danger/30" : ""}
            />
            {keyError && <p className="text-[12px] text-status-danger">{keyError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-key-priority">调度初始优先级 (数字越小越先调用，默认 50)</Label>
            <Input
              id="add-key-priority"
              type="number"
              min={1}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(Number.parseInt(e.target.value, 10) || 50)}
            />
          </div>

          {/* 默认勾选的自动同步推荐模型 */}
          <div className="flex items-start gap-2.5 rounded-lg border border-[#E2E2DF] bg-[#FCFCFB] p-3">
            <Checkbox
              id="add-key-autosync"
              checked={autoSyncModels}
              onCheckedChange={(checked) => setAutoSyncModels(Boolean(checked))}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="add-key-autosync" className="cursor-pointer text-[13px] font-normal text-[#1F1E1D]">
                自动同步并启用该渠道的所有推荐模型
              </Label>
              <p className="text-[12px] text-[#78716C]">
                勾选后，系统将自动发现或预配该渠道常用模型并直接上线调度，无需手动二次添加。
              </p>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="s" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button size="s" onClick={handleSave} disabled={loading} className="gap-1.5">
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            保存并同步
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
