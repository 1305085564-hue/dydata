"use client";

import type { AiConfigBundle } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BusinessAssuranceView({
  bundle,
  onGoToSupply,
}: {
  bundle: AiConfigBundle | null;
  onGoToSupply: (modelId: string) => void;
}) {
  const report = useAvailabilityReport(bundle);
  const activeModels = (report?.modelFamilies ?? []).filter((family) => family.isShelved);
  const modelById = new Map((bundle?.models ?? []).map((model) => [model.model_id, model]));

  if (!report || activeModels.length === 0) {
    return <div className="rounded-xl border border-[#E2E2DF] bg-white p-8 text-center text-[13px] text-[#78716C]">暂无已上架模型，先接入渠道并同步模型。</div>;
  }

  return (
    <section aria-label="业务保障" className="space-y-2">
      <div className="rounded-xl border border-[#E2E2DF] bg-white shadow-input">
        <div className="border-b border-[#E2E2DF]/70 px-4 py-3">
          <h2 className="text-[15px] font-medium text-[#141413]">业务保障</h2>
          <p className="mt-1 text-[12px] text-[#78716C]">按模型查看当前可调度渠道，断供时可直接去更换模型。</p>
        </div>
        <div className="divide-y divide-[#E2E2DF]/60">
          {activeModels.map((family) => {
            const unavailable = family.schedulableChannelCount === 0;
            const boundFeatures = report.affectedBusinessFeatures.filter((feature) => feature.resolvedModelId === family.modelId);
            const displayName = family.displayName || modelById.get(family.modelId)?.display_name || getModelDisplayName(family.modelId);
            return (
              <div key={family.modelId} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between", unavailable && "bg-[#C0685C]/5")}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[#141413]">{displayName}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px]", unavailable ? "bg-[#C0685C]/10 text-[#C0685C]" : "bg-[#6FAA7D]/10 text-[#4F805C]")}>{unavailable ? "断供" : "可用"}</span>
                    <span className="text-[12px] text-[#78716C]">{family.schedulableChannelCount} 条可调度渠道</span>
                  </div>
                  {boundFeatures.length > 0 && <p className="mt-1 text-[11px] text-[#C0685C]">影响业务：{boundFeatures.map((feature) => feature.label).join("、")}</p>}
                </div>
                {unavailable && <Button size="s" variant="outline" className="h-7 shrink-0 text-[12px] text-[#C0685C]" onClick={() => onGoToSupply(family.modelId)}>去换模型</Button>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
