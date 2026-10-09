"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Settings2,
  Archive,
  ArchiveRestore,
  Play,
} from "lucide-react";
import { useAiConfig, type AiFeatureControl } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { ModelFamilySelect } from "./model-family-select";
import { BindingDialog } from "./bindings-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { formatLatency } from "@/lib/ai-config/presentation";
import { cn } from "@/lib/utils";

function ChannelRedundancyCell({
  modelId,
  report,
  isGlobalDefault = false,
}: {
  modelId: string | null;
  report: ReturnType<typeof useAvailabilityReport>;
  isGlobalDefault?: boolean;
}) {
  // 非全局默认行且未指定专属模型（即跟随全局默认）
  if (!isGlobalDefault && !modelId) {
    return <span className="text-[12px] text-[#A8A29E]">跟随全局默认</span>;
  }

  // 全局默认行但未配置模型
  if (!modelId) {
    return <span className="text-[12px] text-[#A8A29E]">未配置模型</span>;
  }

  const family = report?.modelFamilies.find((f) => f.modelId === modelId);
  const channels = family?.channels ?? [];
  const totalCount = channels.length;

  if (totalCount === 0) {
    return <span className="text-[12px] text-[#B98A54]">共 0 条（未接入专线）</span>;
  }

  const availableChannels = channels.filter((c) => c.isSchedulable);
  const faultChannels = channels.filter((c) => !c.isSchedulable && c.health === "fault");
  const disabledChannels = channels.filter((c) => !c.isSchedulable && c.health === "disabled");
  const otherUnusableChannels = channels.filter(
    (c) => !c.isSchedulable && c.health !== "fault" && c.health !== "disabled"
  );

  const availableLabels = availableChannels.map((c) => c.label || "未命名专线");

  const unusableItems: Array<{ label: string; reason: string }> = [];
  for (const c of faultChannels) {
    unusableItems.push({ label: c.label || "未命名专线", reason: "故障" });
  }
  for (const c of disabledChannels) {
    unusableItems.push({ label: c.label || "未命名专线", reason: "已停用" });
  }
  for (const c of otherUnusableChannels) {
    unusableItems.push({ label: c.label || "未命名专线", reason: "熔断" });
  }

  // 全部断供 / 全部不可用
  if (availableChannels.length === 0) {
    const detailText =
      unusableItems.length > 0
        ? `（${unusableItems.map((i) => `${i.label} ${i.reason}`).join(" · ")}）`
        : "（无可用专线）";
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="font-mono text-[#78716C]">共 {totalCount} 条：</span>
        <span className="inline-flex items-center gap-1 text-[#C75D5D]">
          <span className="size-1.5 rounded-full bg-[#C75D5D]" />
          全部不可用{detailText}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="font-mono text-[#78716C]">共 {totalCount} 条：</span>
      <span className="inline-flex items-center gap-1 text-[#2E7D32]">
        <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
        {availableLabels.join("、")} 可用
      </span>
      {unusableItems.length > 0 && (
        <>
          <span className="text-[#A8A29E]">·</span>
          <span className="inline-flex items-center gap-1 text-[#C75D5D]">
            <span className="size-1.5 rounded-full bg-[#C75D5D]" />
            {unusableItems.map((i) => `${i.label} 不可用（${i.reason}）`).join(" · ")}
          </span>
        </>
      )}
    </div>
  );
}

export function BusinessFunctionsPanel({ fallbackNonce = 0 }: { fallbackNonce?: number }) {
  const {
    bundle,
    saveFeatureControl,
    setGlobalDefaultModel,
    archiveFeature,
    restoreFeature,
    testKeyConnection,
  } = useAiConfig();

  const [bindingModal, setBindingModal] = useState<{
    open: boolean;
    data: AiFeatureControl | null;
  }>({
    open: false,
    data: null,
  });

  const [archiveModal, setArchiveModal] = useState<AiFeatureControl | null>(null);
  const archiveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [highlightedFeatureKey, setHighlightedFeatureKey] = useState<string | null>(null);

  // 截图识别专属试跑状态
  const [testingOcr, setTestingOcr] = useState(false);

  // 全局默认兜底设置
  const defaultBinding = bundle?.featureBindings.find((b) => b.feature_key === "default");
  const globalDefaultModelId = defaultBinding?.model_id ?? null;

  // 统一可用性口径：全局默认模型有可调度渠道才算运行中，否则如实标注回落
  const report = useAvailabilityReport(bundle);
  const globalDefaultAvailable =
    Boolean(globalDefaultModelId && (report?.modelFamilies.find((f) => f.modelId === globalDefaultModelId)?.schedulableChannelCount ?? 0) > 0);

  const getStatusForFeature = useCallback((ctrl: AiFeatureControl) => {
    if (!ctrl.isEnabled) return "paused" as const;
    const modelId = ctrl.modelId ?? globalDefaultModelId;
    return modelId && (report?.modelFamilies.find((f) => f.modelId === modelId)?.schedulableChannelCount ?? 0) > 0 ? "running" as const : "fallback" as const;
  }, [globalDefaultModelId, report]);

  // 截图识别配置
  const ocrControl = useMemo(() => {
    return bundle?.featureControls.find((c) => c.key === "ocr_screenshot") ?? null;
  }, [bundle]);

  // 活跃业务功能列表（排除截图识别及内部结构化，因其已在表格置顶展现；排除 default）
  const businessFeatures = useMemo(() => {
    if (!bundle) return [];
    return bundle.featureControls.filter(
      (c) =>
        c.group === "business" &&
        c.key !== "ocr_screenshot" &&
        c.key !== "ocr_screenshot_structure" &&
        c.lifecycleState !== "archived"
    );
  }, [bundle]);

  const archivedFeatures = useMemo(() => {
    if (!bundle) return [];
    return bundle.featureControls.filter(
      (c) => c.lifecycleState === "archived"
    );
  }, [bundle]);

  useEffect(() => {
    if (fallbackNonce <= 0) return;
    const target = businessFeatures.find((feature) => getStatusForFeature(feature) === "fallback");
    if (!target) {
      feedbackToast.warning("异常已恢复，请刷新");
      return;
    }
    const element = Array.from(document.querySelectorAll<HTMLElement>("[data-feature-key]"))
      .find((candidate) => candidate.dataset.featureKey === target.key);
    if (!element) {
      feedbackToast.warning("异常已恢复，请刷新");
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const highlightTimer = window.setTimeout(() => setHighlightedFeatureKey(target.key), 0);
    const clearTimer = window.setTimeout(() => setHighlightedFeatureKey(null), 2000);
    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(clearTimer);
    };
  }, [fallbackNonce, businessFeatures, getStatusForFeature]);

  const handleModelChange = async (featureKey: string, modelId: string | null) => {
    const ctrl = bundle?.featureControls.find((c) => c.key === featureKey);
    if (!ctrl) return;
    const ok = await saveFeatureControl({
      feature_key: ctrl.key,
      model_id: modelId,
      provider_key_model_id: ctrl.providerKeyModelId,
      system_prompt: ctrl.systemPrompt,
      output_token_limit: ctrl.outputTokenLimit,
      context_message_limit: ctrl.contextMessageLimit,
      is_enabled: ctrl.isEnabled,
    });
    if (ok) feedbackToast.success(`已更新「${ctrl.label}」的模型调度`);
  };

  const handleGlobalDefaultChange = async (modelId: string | null) => {
    if (!modelId) return;
    const ok = await setGlobalDefaultModel(modelId);
    if (ok) feedbackToast.success("已更新全局默认 AI 兜底模型");
  };

  const handleOcrModelChange = async (newModelId: string | null) => {
    if (!ocrControl) return;
    const ok = await saveFeatureControl({
      feature_key: "ocr_screenshot",
      model_id: newModelId,
      provider_key_model_id: ocrControl.providerKeyModelId,
      system_prompt: ocrControl.systemPrompt,
      output_token_limit: ocrControl.outputTokenLimit,
      context_message_limit: ocrControl.contextMessageLimit,
      is_enabled: ocrControl.isEnabled,
      ocr_screenshot_channel: ocrControl.ocrChannel,
    });
    if (ok) feedbackToast.success("已更新截图识别模型调度");
  };

  const handleOcrTrialRun = async () => {
    if (!bundle || !ocrControl) return;
    setTestingOcr(true);
    try {
      const selectedModelId = ocrControl.modelId;
      const currentModelKeys = bundle.models.filter(
        (m) => m.model_id === selectedModelId && m.is_enabled
      );
      const targetModel = currentModelKeys[0];
      const targetKeyId = targetModel?.key_id || bundle.keys.find((k) => k.is_enabled)?.id;
      if (!targetKeyId) {
        feedbackToast.warning("当前没有可用于试跑的可用密钥");
        return;
      }
      const keyLabel = bundle.keys.find((k) => k.id === targetKeyId)?.label || "未命名密钥";
      const modelLabel = selectedModelId ? getModelDisplayName(selectedModelId) : "自动调度";
      const res = await testKeyConnection(targetKeyId, selectedModelId || undefined, "vision");
      if (res?.ok) {
        feedbackToast.success(`试跑连通正常 · ${modelLabel} · 密钥「${keyLabel}」· 耗时 ${formatLatency(res.latencyMs)}`);
      } else {
        const message = res?.message || "无响应";
        feedbackToast.error(`试跑未通过: ${message}`);
      }
    } finally {
      setTestingOcr(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 业务功能调度列表（全站统一发丝表格） */}
      <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-input">
        <div className="border-b border-[#E2E2DF]/60 bg-[#FCFCFB] px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-[#D97757]" />
            <span className="text-[13px] font-medium text-[#1F1E1D]">
              业务模块调度列表
            </span>
          </div>
          <span className="text-[12px] text-[#78716C]">
            选定模型系列后，底层自动挑选最佳就绪密钥
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E2E2DF]/60 bg-[#FCFCFB]/80">
              <TableHead className="w-[140px] text-[12px] font-normal text-[#78716C] py-2 px-3">业务功能</TableHead>
              <TableHead className="min-w-[160px] text-[12px] font-normal text-[#78716C] py-2 px-3">定位与说明</TableHead>
              <TableHead className="min-w-[240px] w-[260px] text-[12px] font-normal text-[#78716C] py-2 px-3">调度模型系列</TableHead>
              <TableHead className="min-w-[200px] text-[12px] font-normal text-[#78716C] py-2 px-3">专线冗余与健康度</TableHead>
              <TableHead className="w-[120px] text-[12px] font-normal text-[#78716C] py-2 px-3">运行状态</TableHead>
              <TableHead className="w-[100px] text-right text-[12px] font-normal text-[#78716C] py-2 px-3">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 1. 全局默认兜底行 */}
            <TableRow className="bg-[#FAF9F6]/60 hover:bg-[#FAF9F6] border-b border-[#E2E2DF]/60">
              <TableCell className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-normal text-[#1F1E1D]">全局默认</span>
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
                    兜底
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2.5 px-3">
                <div className="text-[12px] text-[#78716C] truncate max-w-[280px]">
                  未配置专属模型时全站调用的兜底基座
                </div>
              </TableCell>
              <TableCell className="py-2.5 px-3">
                <div className="w-full max-w-[270px]">
                  <ModelFamilySelect
                    value={globalDefaultModelId}
                    onChange={handleGlobalDefaultChange}
                    allowEmptyLabel=""
                  />
                </div>
              </TableCell>
              <TableCell className="py-2.5 px-3">
                <ChannelRedundancyCell
                  modelId={globalDefaultModelId}
                  report={report}
                  isGlobalDefault={true}
                />
              </TableCell>
              <TableCell className="py-2.5 px-3">
                {globalDefaultModelId && globalDefaultAvailable ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-[#78716C]">
                    <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                    运行中
                  </span>
                ) : globalDefaultModelId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-normal bg-[#B98A54]/10 text-[#B98A54]">
                    <span className="size-1.5 rounded-full bg-[#B98A54]" />
                    按全局顺位兜底
                  </span>
                ) : (
                  <span className="text-[12px] text-[#B98A54]">未配置</span>
                )}
              </TableCell>
              <TableCell className="text-right py-2.5 px-3">
                <span className="text-[12px] text-[#A8A29E]">—</span>
              </TableCell>
            </TableRow>

            {/* 2. 核心业务功能：截图识别 */}
            {ocrControl && (
              <TableRow
                data-feature-key={ocrControl.key}
                className={cn(
                  "hover:bg-[#F7F7F6]/60 border-b border-[#E2E2DF]/60 transition-colors",
                  highlightedFeatureKey === ocrControl.key && "ring-2 ring-[#D97757]/30 bg-[#D97757]/5",
                )}
              >
                <TableCell className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-normal text-[#1F1E1D]">截图识别</span>
                    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#D97757]/10 text-[#D97757]">
                      核心
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  <div
                    className="text-[12px] text-[#78716C] truncate max-w-[280px]"
                    title="提取图片中短视频与运营指标"
                  >
                    提取图片中短视频与运营指标
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  <div className="w-full max-w-[270px]">
                    <ModelFamilySelect
                      value={ocrControl.modelId}
                      onChange={handleOcrModelChange}
                      allowEmptyLabel="跟随全局默认兜底"
                    />
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  <ChannelRedundancyCell
                    modelId={ocrControl.modelId}
                    report={report}
                  />
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  {getStatusForFeature(ocrControl) === "running" ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#78716C]">
                      <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                      运行中
                    </span>
                  ) : getStatusForFeature(ocrControl) === "fallback" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-normal bg-[#B98A54]/10 text-[#B98A54]">
                      <span className="size-1.5 rounded-full bg-[#B98A54]" />
                      按全局顺位兜底
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
                      <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                      已暂停
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right py-2.5 px-3">
                  <div className="inline-flex items-center justify-end gap-1">
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="s"
                              disabled={testingOcr}
                              className="size-7 p-0 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                              onClick={handleOcrTrialRun}
                              aria-label="试跑视觉通道"
                            >
                              <Play className={cn("size-3 text-[#D97757]", testingOcr && "animate-pulse")} />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" className="text-[12px]">
                          {testingOcr ? "视觉测试中…" : "试跑视觉通道"}
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="s"
                              className="size-7 p-0 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                              onClick={() => setBindingModal({ open: true, data: ocrControl })}
                              aria-label="调整高级参数"
                            >
                              <Settings2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" className="text-[12px]">
                          调整高级参数
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="s"
                              className="size-7 p-0 text-[#78716C] hover:text-status-danger hover:bg-status-danger/10"
                              onClick={() => setArchiveModal(ocrControl)}
                              aria-label="停用该功能"
                            >
                              <Archive className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" className="text-[12px]">
                          停用该功能
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* 3. 其余活跃业务功能列表 */}
            {businessFeatures.map((feature) => (
              <TableRow
                key={feature.key}
                data-feature-key={feature.key}
                className={cn(
                  "hover:bg-[#F7F7F6]/60 border-b border-[#E2E2DF]/60 last:border-b-0 transition-colors",
                  highlightedFeatureKey === feature.key && "ring-2 ring-[#D97757]/30 bg-[#D97757]/5",
                )}
              >
                <TableCell className="py-2.5 px-3 text-[13px] font-normal text-[#1F1E1D]">
                  {feature.label}
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  <div
                    className="text-[12px] text-[#78716C] truncate max-w-[280px]"
                    title={feature.description}
                  >
                    {feature.description}
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  <div className="w-full max-w-[270px]">
                    <ModelFamilySelect
                      value={feature.modelId}
                      onChange={(mId) => handleModelChange(feature.key, mId)}
                      allowEmptyLabel="跟随全局默认兜底"
                    />
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  <ChannelRedundancyCell
                    modelId={feature.modelId}
                    report={report}
                  />
                </TableCell>
                <TableCell className="py-2.5 px-3">
                  {getStatusForFeature(feature) === "running" ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#78716C]">
                      <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                      运行中
                    </span>
                  ) : getStatusForFeature(feature) === "fallback" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-normal bg-[#B98A54]/10 text-[#B98A54]">
                      <span className="size-1.5 rounded-full bg-[#B98A54]" />
                      按全局顺位兜底
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
                      <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                      已暂停
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right py-2.5 px-3">
                  <div className="inline-flex items-center justify-end gap-1">
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="s"
                              className="size-7 p-0 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                              onClick={() => setBindingModal({ open: true, data: feature })}
                              aria-label="调整高级参数"
                            >
                              <Settings2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" className="text-[12px]">
                          调整高级参数
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="s"
                              className="size-7 p-0 text-[#78716C] hover:text-status-danger hover:bg-status-danger/10"
                              onClick={() => setArchiveModal(feature)}
                              aria-label="停用该功能"
                            >
                              <Archive className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" className="text-[12px]">
                          停用该功能
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 已停用/归档功能折叠区（若有） */}
      {archivedFeatures.length > 0 && (
        <div className="rounded-xl border border-[#E2E2DF]/60 bg-[#FAF9F8]/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-[#78716C]">
            <Archive className="size-3.5" />
            <span>已停用的功能 ({archivedFeatures.length})</span>
          </div>
          <div className="divide-y divide-[#E2E2DF]/40">
            {archivedFeatures.map((af) => (
              <div key={af.key} className="flex items-center justify-between py-2 text-[12px]">
                <span className="text-[#78716C] line-through">{af.label}</span>
                <Button
                  variant="ghost"
                  size="s"
                  className="h-7 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                  onClick={() => restoreFeature(af.key)}
                >
                  <ArchiveRestore className="size-3 mr-1" /> 恢复启用
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 高级参数弹窗 */}
      <BindingDialog
        open={bindingModal.open}
        control={bindingModal.data}
        onOpenChange={(open) => setBindingModal({ ...bindingModal, open })}
        onSave={async (data) => {
          const ok = await saveFeatureControl(data);
          if (ok) feedbackToast.success("保存设置成功");
          return ok;
        }}
      />

      {/* 停用确认弹窗 */}
      <ConfirmDialog
        open={!!archiveModal}
        title={`停止使用「${archiveModal?.label ?? ""}」`}
        description="系统会保留当前配置与历史映射，但前台将阻止发起该业务请求。后续可随时恢复。"
        confirmText="确认停止"
        cancelText="取消"
        onConfirm={async () => {
          if (archiveModal) {
            const target = archiveModal;
            feedbackToast.warning(`已停用「${target.label}」，5 秒内可撤回`, {
              duration: 5000,
              action: { label: "撤回", onClick: () => { const timer = archiveTimers.current[target.key]; if (timer) clearTimeout(timer); delete archiveTimers.current[target.key]; feedbackToast.success("已撤回停用"); } },
            });
            const timer = setTimeout(() => { void archiveFeature(target.key); delete archiveTimers.current[target.key]; }, 5000);
            archiveTimers.current[target.key] = timer;
          }
          setArchiveModal(null);
        }}
        onOpenChange={(open) => {
          if (!open) setArchiveModal(null);
        }}
      />
    </div>
  );
}
