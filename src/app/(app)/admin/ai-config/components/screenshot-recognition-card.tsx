"use client";

import { useState } from "react";
import { Camera, Settings2, Play } from "lucide-react";
import { useAiConfig } from "../hooks/use-ai-config";
import { ModelFamilySelect } from "./model-family-select";
import { BindingDialog } from "./bindings-dialogs";
import { Button } from "@/components/ui/button";
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  if (!bundle || !ocrControl) return null;

  const channel: ChannelMode = ocrControl.ocrChannel;
  const selectedModelId = ocrControl.modelId;

  // 统计当前模型就绪密钥数
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
        feedbackToast.success("试跑用例通过 · 识别与结构化提取正常");
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
        "rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-input transition-shadow space-y-3",
        className
      )}
    >
      {/* 头部：标题 + 核心徽标 + 运行状态 + 操作 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-[#D97757]/10 text-[#D97757]">
            <Camera className="size-3.5" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-[#1F1E1D]">
              ✦ 截图识别与结构化提取
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-normal bg-[#6FAA7D]/10 text-[#6FAA7D]">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              运行中
            </span>
            <span className="text-[12px] text-[#78716C] hidden sm:inline">
              · 首页日报核心依赖，支持图片指标提取与结构化映射
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="s"
            variant="outline"
            onClick={handleTrialRun}
            disabled={testing}
            className="h-7 gap-1 border-[#E2E2DF] text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120"
          >
            <Play className={cn("size-3 text-[#D97757]", testing && "animate-pulse")} />
            {testing ? "试跑中…" : "试跑真实用例"}
          </Button>
          <Button
            size="s"
            variant="ghost"
            onClick={() => setDialogOpen(true)}
            className="h-7 gap-1 text-[12px] text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
          >
            <Settings2 className="size-3.5" />
            高级参数
          </Button>
        </div>
      </div>

      {/* 核心调度同轴配置栏（去除套娃灰色大框与巨型卡片） */}
      <div className="pt-2 border-t border-[#E2E2DF]/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* 左侧：识别模式分段切换 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[#78716C] shrink-0">识别模式：</span>
          <div className="inline-flex items-center rounded-md bg-[#F1F1F0] p-0.5 border border-[#E2E2DF]/60">
            <button
              type="button"
              onClick={() => handleChannelChange("baidu")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-all cursor-pointer",
                channel === "baidu"
                  ? "bg-white text-[#141413] shadow-input font-medium"
                  : "text-[#78716C] hover:text-[#141413] font-normal"
              )}
            >
              <span>百度 OCR + 大模型归位</span>
              <span className="text-[12px] text-[#D97757] bg-[#D97757]/10 px-1.5 py-0.5 rounded leading-tight">
                推荐
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleChannelChange("vision")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-all cursor-pointer",
                channel === "vision"
                  ? "bg-white text-[#141413] shadow-input font-medium"
                  : "text-[#78716C] hover:text-[#141413] font-normal"
              )}
            >
              <span>单视觉大模型直识</span>
            </button>
          </div>
        </div>

        {/* 右侧：模型调度与就绪状态 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[#78716C] shrink-0">调度模型：</span>
          <div className="w-52">
            <ModelFamilySelect
              value={selectedModelId}
              onChange={handleModelChange}
              allowEmptyLabel="跟随全局默认兜底"
            />
          </div>
          {!selectedModelId && (
            <span className="text-[12px] text-[#78716C]">
              (自动调度全局可用渠道)
            </span>
          )}
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
