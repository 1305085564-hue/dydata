"use client";

import { useState } from "react";
import { Camera, Archive, ArchiveRestore } from "lucide-react";
import { useAiConfig } from "../hooks/use-ai-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ChannelMode = "baidu" | "vision";

/**
 * 截图识别通道控制卡片（上面管通道切换，下面表格管模型与运行开关）
 */
export function ScreenshotRecognitionCard({
  className,
}: {
  className?: string;
}) {
  const {
    bundle,
    saveFeatureControl,
    archiveFeature,
    restoreFeature,
  } = useAiConfig();

  const ocrControl =
    bundle?.featureControls.find((c) => c.key === "ocr_screenshot") ?? null;

  // 草稿状态：undefined = 未改动，跟随线上值
  const [channelDraft, setChannelDraft] = useState<ChannelMode | undefined>(
    undefined,
  );
  const [saving, setSaving] = useState(false);

  if (!bundle || !ocrControl) return null;

  const channel: ChannelMode = channelDraft ?? ocrControl.ocrChannel;
  const dirty =
    channelDraft !== undefined && channelDraft !== ocrControl.ocrChannel;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (channelDraft !== undefined) {
        const ok = await saveFeatureControl({
          feature_key: "ocr_screenshot",
          model_id: ocrControl.modelId,
          provider_key_model_id: ocrControl.providerKeyModelId,
          system_prompt: ocrControl.systemPrompt,
          output_token_limit: ocrControl.outputTokenLimit,
          context_message_limit: ocrControl.contextMessageLimit,
          is_enabled: ocrControl.isEnabled,
          ocr_screenshot_channel: channel,
        });
        if (ok) {
          setChannelDraft(undefined);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const archived = ocrControl.lifecycleState === "archived";

  return (
    <div className={cn("space-y-3", className)}>
      {/* 顶部标题行 + 状态 + 动作 */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-[#E5E0D6]/40">
        <div className="flex items-center gap-2 text-[#1C1917] font-medium text-[14px]">
          <Camera className="size-4 text-[#D97757]" />
          <span>截图识别</span>
          <Badge
            variant="secondary"
            className="bg-[#F5F3EE] text-[#78716C] text-[10px] h-4.5 px-1.5 font-normal"
          >
            首页核心
          </Badge>
          {archived ? (
            <Badge
              variant="outline"
              className="bg-[#F5F3EE] text-[#78716C] border-[#E5E0D6] text-[11px] font-normal"
            >
              已停止
            </Badge>
          ) : ocrControl.isEnabled ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-[#16A34A]">
              <span className="size-1.5 rounded-full bg-[#16A34A]" />
              使用中
            </span>
          ) : (
            <Badge
              variant="outline"
              className="bg-[#F5F3EE] text-[#78716C] border-[#E5E0D6]/80 text-[11px] font-normal"
            >
              已关闭
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {archived ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="恢复截图识别"
              className="h-7.5 px-2.5 text-[12px] text-[#292524] hover:bg-[#F5F3EE] cursor-pointer"
              onClick={() => restoreFeature("ocr_screenshot")}
            >
              <ArchiveRestore className="size-3.5 mr-1 text-[#78716C]" />
              恢复
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className={cn(
                  "h-7.5 px-3 text-[12px] transition-all cursor-pointer",
                  dirty
                    ? "bg-[#D97757] hover:bg-[#C86646] text-white shadow-2xs font-medium border-transparent"
                    : "bg-white border border-[#E5E0D6] text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] disabled:opacity-50",
                )}
                disabled={!dirty || saving}
                onClick={handleSave}
              >
                {saving ? "保存中…" : dirty ? "保存通道" : "已保存"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="停止使用截图识别"
                className="h-7.5 px-2 text-[12px] text-[#78716C] hover:text-[#C9604D] hover:bg-[#F5F3EE]/60 transition-colors cursor-pointer"
                onClick={() => archiveFeature("ocr_screenshot")}
              >
                <Archive className="size-3.5 mr-1 opacity-70" />
                停止
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 识别通道切换 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="space-y-0.5">
          <div className="text-[13px] font-medium text-[#1C1917]">
            识别通道策略
          </div>
          <div className="text-[11px] text-[#78716C]">
            {channel === "baidu"
              ? "百度 OCR 提取文本 + 归位大模型清洗结构，兼顾高准确率与低成本"
              : "单视觉大模型（Vision）直接处理原图，无需第三方 OCR 接口"}
          </div>
        </div>
        <div className="inline-flex p-0.5 rounded-lg bg-[#F5F3EE] border border-[#E5E0D6] shrink-0 select-none">
          {(
            [
              { value: "baidu", label: "百度 OCR + 归位" },
              { value: "vision", label: "视觉大模型" },
            ] as const
          ).map((option) => {
            const active = channel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setChannelDraft(option.value)}
                className={cn(
                  "h-7.5 px-3.5 rounded-md text-[12px] transition-all cursor-pointer",
                  active
                    ? "bg-white text-[#1C1917] font-medium shadow-2xs border border-[#E5E0D6]/80"
                    : "text-[#78716C] hover:text-[#1C1917]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
