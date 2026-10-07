"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AiProviderKeyModel } from "../hooks/use-ai-config";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getProviderKeyModelHealthStatus } from "@/lib/ai/provider-routing";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { cn } from "@/lib/utils";

interface ModelCardsProps {
  models: AiProviderKeyModel[];
  onToggle: (modelId: string, enabled: boolean) => Promise<boolean>;
  onTest: (modelId: string) => Promise<unknown>;
}

function getModelStatus(model: AiProviderKeyModel) {
  const status = getProviderKeyModelHealthStatus({
    isEnabled: model.is_enabled,
    lastSuccessAt: model.last_success_at,
    lastFailureAt: model.last_failure_at,
    lastFailureScope: model.last_failure_scope === "key" ? "unknown" : model.last_failure_scope,
    unhealthyUntil: model.unhealthy_until,
  });

  if (status === "disabled") return { label: "已禁用", tone: "disabled" as const };
  if (status === "unhealthy" || status === "unknown") return { label: "异常", tone: "unhealthy" as const };
  if (status === "untested") return { label: "待测", tone: "untested" as const };
  return { label: "健康", tone: "healthy" as const };
}

export function ModelCards({ models, onToggle, onTest }: ModelCardsProps) {
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const sortedModels = useMemo(
    () => [...models].sort((a, b) => (a.display_name || a.model_id).localeCompare(b.display_name || b.model_id)),
    [models],
  );

  const handleToggle = async (model: AiProviderKeyModel, enabled: boolean) => {
    if (pendingToggle) return;
    setPendingToggle(model.id);
    try {
      const ok = await onToggle(model.model_id, enabled);
      if (ok) feedbackToast.success(enabled ? "已启用模型" : "已禁用模型");
    } finally {
      setPendingToggle(null);
    }
  };

  const handleTest = async (model: AiProviderKeyModel) => {
    setTesting((previous) => new Set(previous).add(model.id));
    try {
      await onTest(model.model_id);
    } finally {
      setTesting((previous) => {
        const next = new Set(previous);
        next.delete(model.id);
        return next;
      });
    }
  };

  if (sortedModels.length === 0) {
    return <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-[#E2E2DF] text-[13px] text-[#A8A29E]">该渠道暂无模型，点击上方“同步模型”拉取。</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {sortedModels.map((model) => {
        const status = getModelStatus(model);
        const isTesting = testing.has(model.id);
        return (
          <article key={model.id} data-model-id={model.model_id} className="space-y-3 rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-input">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-[13px] font-medium text-[#1F1E1D]">{model.display_name || getModelDisplayName(model.model_id)}</h4>
                {model.display_name && model.display_name !== model.model_id && <p className="mt-1 truncate font-mono text-[11px] text-[#A8A29E]">{model.model_id}</p>}
              </div>
              <span className={cn(
                "inline-flex shrink-0 items-center gap-1 text-[11px]",
                status.tone === "healthy" && "text-[#6FAA7D]",
                (status.tone === "unhealthy" || status.tone === "untested") && "text-[#B98A54]",
                status.tone === "disabled" && "text-[#A8A29E]",
              )}>
                <span className={cn(
                  "size-1.5 rounded-full",
                  status.tone === "healthy" && "bg-[#6FAA7D]",
                  (status.tone === "unhealthy" || status.tone === "untested") && "bg-[#B98A54]",
                  status.tone === "disabled" && "bg-[#A8A29E]",
                )} />
                {status.label}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#E2E2DF]/70 pt-3">
              <span className="text-[12px] text-[#78716C]">启用此模型</span>
              <Switch
                checked={model.is_enabled}
                disabled={pendingToggle !== null}
                onCheckedChange={(checked) => void handleToggle(model, checked)}
                aria-label={`${model.display_name || model.model_id} 启用开关`}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="s"
              className="h-7 w-full gap-1.5 text-[12px]"
              disabled={isTesting || pendingToggle !== null}
              onClick={() => void handleTest(model)}
            >
              {isTesting && <Loader2 className="size-3 animate-spin" />}
              {isTesting ? "检测中…" : "检测连接"}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
