"use client";

import { useState } from "react";
import { Camera, Sparkles, Settings2, Play, CheckCircle2, AlertCircle } from "lucide-react";
import { useAiConfig, type AiFeatureControl } from "../hooks/use-ai-config";
import { ModelFamilySelect } from "./model-family-select";
import { BindingDialog } from "./bindings-dialogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

type ChannelMode = "baidu" | "vision";

export function ScreenshotRecognitionCard({
  className,
}: {
  className?: string;
}) {
  const { bundle, saveFeatureControl, testKeyConnection } = useAiConfig();

  const ocrControl = bundle?.featureControls.find((c) => c.key === "ocr_screenshot") ?? null;
  const structureControl = bundle?.featureControls.find((c) => c.key === "ocr_screenshot_structure") ?? null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  if (!bundle || !ocrControl) return null;

  const channel: ChannelMode = ocrControl.ocrChannel;
  const selectedModelId = ocrControl.modelId;

  // 统计当前模型就绪密钥与延迟
  const currentModelKeys = bundle.models.filter(
    (m) => m.model_id === selectedModelId && m.is_enabled
  );
  const readyKeysCount = currentModelKeys.filter((m) => {
    const k = bundle.keys.find((key) => key.id === m.key_id);
    return k && k.is_enabled;
  }).length;

  const handleChannelChange = async (newChannel: ChannelMode) => {
    if (newChannel === channel) return;
    const ok = await saveFeatureControl({
      feature_key: "ocr_screenshot",
      model_id: ocrControl.modelId,
      provider_key_model_id: ocrControl.providerKeyModelId,
      system_prompt: ocrControl.systemPrompt,
      output_token_limit: ocrControl.outputTokenLimit,
      context_message_limit: ocrControl.contextMessageLimit,
      is_enabled: ocrControl.isEnabled,
      ocr_screenshot_channel: newChannel,
    });
    if (ok) {
      const label = newChannel === "baidu" ? "百度 OCR + 大模型归位" : "单视觉大模型直识";
      feedbackToast.success(`已切换到 ${label} 模式`);
    }
  };

  const handleModelChange = async (newModelId: string | null) => {
    await saveFeatureControl({
      feature_key: "ocr_screenshot",
      model_id: newModelId,
      provider_key_model_id: ocrControl.providerKeyModelId,
      system_prompt: ocrControl.systemPrompt,
      output_token_limit: ocrControl.outputTokenLimit,
      context_message_limit: ocrControl.contextMessageLimit,
      is_enabled: ocrControl.isEnabled,
      ocr_screenshot_channel: channel,
    });
    feedbackToast.success("已更新截图识别模型调度");
  };

  const handleTrialRun = async () => {
    setTesting(true);
    try {
      // 找出当前绑定的首选 key 进行快速验活
      const targetModel = currentModelKeys[0];
      const targetKeyId = targetModel?.key_id || bundle.keys.find((k) => k.is_enabled)?.id;
      if (!targetKeyId) {
        feedbackToast.warning("当前没有可用于试跑的可用密钥");
        return;
      }
      const res = await testKeyConnection(targetKeyId, selectedModelId || undefined);
      if (res?.ok) {
        feedbackToast.success(`试跑用例通过 · 识别与结构化归位正常 · 响应耗时 ${res.latencyMs}ms`);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAdvanced = async (data: Record<string, unknown>) => {
    return await saveFeatureControl(data);
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border border-[#E2E2DF] bg-white p-5 shadow-xs transition-shadow hover:shadow-sm space-y-4",
        className
      )}
    >
      {/* 头部：标题 + 核心徽标 + 运行状态 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-[#D97757]/10 text-[#D97757]">
            <Camera className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-[#1F1E1D]">
                ✦ 截图识别与结构化提取
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-normal bg-[#10B981]/10 text-[#10B981]">
                <span className="size-1.5 rounded-full bg-[#10B981]" />
                运行中
              </span>
            </div>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              首页日报填报的核心依赖，支持图片文字抽取并智能映射为结构化指标
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="s"
            variant="outline"
            onClick={handleTrialRun}
            disabled={testing}
            className="h-7.5 gap-1.5 border-[#E2E2DF] text-[12px] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120"
          >
            <Play className={cn("size-3 text-[#D97757]", testing && "animate-pulse")} />
            {testing ? "试跑中…" : "⚡ 试跑一次真实用例"}
          </Button>
          <Button
            size="s"
            variant="ghost"
            onClick={() => setDialogOpen(true)}
            className="h-7.5 gap-1 text-[12px] text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
          >
            <Settings2 className="size-3.5" />
            高级参数
          </Button>
        </div>
      </div>

      {/* 核心内嵌调度面板 */}
      <div className="rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB] p-4 space-y-3.5">
        {/* 1. 识别模式单选组 */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-normal text-[#78716C]">识别模式：</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleChannelChange("baidu")}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all cursor-pointer",
                channel === "baidu"
                  ? "border-[#D97757] bg-white ring-1 ring-[#D97757]/30 shadow-xs"
                  : "border-[#E2E2DF] bg-white/60 hover:bg-white text-[#78716C]"
              )}
            >
              <div className="mt-0.5 shrink-0">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    channel === "baidu"
                      ? "border-[#D97757] bg-[#D97757]"
                      : "border-[#A8A29E]"
                  )}
                >
                  {channel === "baidu" && <div className="size-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-[#1F1E1D]">
                    百度 OCR + 大模型归位
                  </span>
                  <span className="text-[12px] font-normal text-[#D97757] bg-[#D97757]/10 px-1.5 py-0.2 rounded">
                    推荐
                  </span>
                </div>
                <p className="text-[12px] text-[#78716C]">
                  专业 OCR 提取高精度文本，大模型仅负责结构映射，成本最低且抗干扰强
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChannelChange("vision")}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all cursor-pointer",
                channel === "vision"
                  ? "border-[#D97757] bg-white ring-1 ring-[#D97757]/30 shadow-xs"
                  : "border-[#E2E2DF] bg-white/60 hover:bg-white text-[#78716C]"
              )}
            >
              <div className="mt-0.5 shrink-0">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    channel === "vision"
                      ? "border-[#D97757] bg-[#D97757]"
                      : "border-[#A8A29E]"
                  )}
                >
                  {channel === "vision" && <div className="size-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-[#1F1E1D]">
                    单视觉大模型直识
                  </span>
                </div>
                <p className="text-[12px] text-[#78716C]">
                  图片直传视觉大模型（Vision），无需第三方 OCR 依赖，适合备用通道
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 2. 模型调度与备用阶梯 */}
        <div className="space-y-2 pt-1 border-t border-[#E2E2DF]/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-normal text-[#78716C]">调度模型：</span>
              <div className="w-56">
                <ModelFamilySelect
                  value={selectedModelId}
                  onChange={handleModelChange}
                  allowEmptyLabel="跟随全局默认兜底"
                />
              </div>
            </div>
          </div>

          <div className="rounded-md bg-[#F1F1F0]/70 p-2.5 text-[12px] text-[#78716C] space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[#141413] font-normal">
                └─ {readyKeysCount > 0 ? `${readyKeysCount} 个密钥就绪` : "暂无专属就绪密钥（自动调用全局可用渠道）"}
              </span>
              <span>· 故障自动无缝切流</span>
            </div>
          </div>
        </div>
      </div>

      <BindingDialog
        open={dialogOpen}
        control={ocrControl}
        onOpenChange={setDialogOpen}
        onSave={handleSaveAdvanced}
      />
    </div>
  );
}
