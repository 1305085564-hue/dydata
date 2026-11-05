"use client";

import { useState } from "react";
import { type AiProvider, useAiConfig } from "../hooks/use-ai-config";
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
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Pencil, Server } from "lucide-react";
import { DangerousActionDialog, type ImpactConfirmationState } from "./dangerous-action-dialog";

export function ManageProvidersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { bundle, runCommand } = useAiConfig();
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [impactConfirm, setImpactConfirm] = useState<ImpactConfirmationState>(null);
  const [isSaving, setIsSaving] = useState(false);

  const providers = bundle?.providers ?? [];

  const executeWithConfirm = async (
    action: string,
    data: Record<string, unknown>,
    entity?: "provider" | "key" | "model" | "feature_binding",
    successMsg?: string
  ) => {
    const res = await runCommand(action, data, entity);
    if (res.ok) {
      if (successMsg) feedbackToast.success(successMsg);
      return true;
    }

    if (res.status === 409 && res.requiresConfirmation) {
      setImpactConfirm({
        type: "impact",
        affectedBusinesses: res.affectedBusinesses || [],
        onConfirm: async () => {
          const retryRes = await runCommand(action, { ...data, confirm_impact: true }, entity);
          if (retryRes.ok) {
            if (successMsg) feedbackToast.success(successMsg);
          } else {
            feedbackToast.error(retryRes.error || "操作失败");
          }
        },
      });
      return false;
    }

    feedbackToast.error(res.error || "操作失败");
    return false;
  };

  const handleToggleProvider = async (provider: AiProvider, nextEnabled: boolean) => {
    await executeWithConfirm(
      "update",
      { id: provider.id, is_enabled: nextEnabled },
      "provider",
      nextEnabled ? `已启用接入点「${provider.name}」` : `已停用接入点「${provider.name}」`
    );
  };

  const handleStartEdit = (provider: AiProvider) => {
    setEditingProvider(provider);
    setEditBaseUrl(provider.base_url);
  };

  const handleSaveEdit = async () => {
    if (!editingProvider) return;
    const trimmed = editBaseUrl.trim();
    if (!trimmed) {
      feedbackToast.error("API 地址不能为空");
      return;
    }
    setIsSaving(true);
    try {
      const ok = await executeWithConfirm(
        "update",
        { id: editingProvider.id, base_url: trimmed },
        "provider",
        "已更新接入点地址"
      );
      if (ok) setEditingProvider(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[88vh] w-[94vw] max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader className="border-b border-[#E2E2DF]/60 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Server className="size-5 text-[#78716C]" />
              <DialogTitle className="text-[20px] text-[#141413]">接入点管理</DialogTitle>
            </div>
            <p className="text-[12px] text-[#78716C]">
              整组管理同一服务商地址。修改地址或停用接入点将影响其下的全部渠道。
            </p>
          </DialogHeader>

          <DialogBody className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
            {editingProvider ? (
              <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-2">
                  <span className="font-normal text-[14px] text-[#141413]">
                    修改地址 · {editingProvider.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="s"
                    onClick={() => setEditingProvider(null)}
                    className="h-7 text-[12px] text-[#78716C]"
                  >
                    取消
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-[12px] text-[#1F1E1D]">Base URL</Label>
                  <Input
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    className="h-8 font-mono text-[12px] border-[#E2E2DF]"
                    placeholder="https://..."
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    size="s"
                    disabled={isSaving}
                    onClick={handleSaveEdit}
                    className="h-7 px-3 text-[12px] bg-[#D97757] text-white hover:bg-[#D97757]/90 font-normal"
                  >
                    {isSaving ? "保存中…" : "确认修改"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white overflow-hidden">
              {providers.map((p) => {
                const channelCount = bundle?.keys.filter((k) => k.provider_id === p.id).length ?? 0;
                return (
                  <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-[12px]">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-normal text-[14px] text-[#141413] truncate">{p.name}</span>
                        <span className="text-[#78716C]">({channelCount} 条渠道)</span>
                      </div>
                      <div className="font-mono text-[#78716C] truncate">{p.base_url}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-s"
                        onClick={() => handleStartEdit(p)}
                        className="size-7 text-[#78716C] hover:text-[#141413]"
                        title="修改此接入点地址"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Switch
                        checked={p.is_enabled}
                        onCheckedChange={(checked) => handleToggleProvider(p, checked)}
                        aria-label={`开关接入点${p.name}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogBody>

          <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3 shrink-0 flex justify-end">
            <Button
              variant="outline"
              size="s"
              onClick={() => onOpenChange(false)}
              className="h-8 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DangerousActionDialog
        state={impactConfirm}
        onClose={() => setImpactConfirm(null)}
      />
    </>
  );
}
