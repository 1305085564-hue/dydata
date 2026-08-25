"use client";

import { useMemo, useState } from "react";
import { Camera, Archive, ArchiveRestore } from "lucide-react";
import { useAiConfig } from "../hooks/use-ai-config";
import { buildModelDirectory } from "../model-directory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ModelChainSelect } from "./model-chain-select";
import { cn } from "@/lib/utils";

type ChannelMode = "baidu" | "vision";

/**
 * 截图识别合并卡片（视觉与交互打磨版）：
 * - 通道开关决定槽位显隐：百度 = 归位模型(structure) + 备用看图模型(ocr)；视觉 = 看图模型(ocr)
 * - 数据层仍是两个绑定行，界面合并；保存走现有 saveFeatureControl
 */
export function ScreenshotRecognitionCard() {
  const {
    bundle,
    saveFeatureControl,
    archiveFeature,
    restoreFeature,
  } = useAiConfig();

  const ocrControl = bundle?.featureControls.find((c) => c.key === "ocr_screenshot") ?? null;
  const structureControl = bundle?.featureControls.find((c) => c.key === "ocr_screenshot_structure") ?? null;

  // 草稿状态：undefined = 未改动，跟随线上值
  const [channelDraft, setChannelDraft] = useState<ChannelMode | undefined>(undefined);
  const [ocrModelDraft, setOcrModelDraft] = useState<string | null | undefined>(undefined);
  const [structureModelDraft, setStructureModelDraft] = useState<string | null | undefined>(undefined);
  const [structureEnabledDraft, setStructureEnabledDraft] = useState<boolean | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const modelDirectory = useMemo(() => (bundle ? buildModelDirectory(bundle) : []), [bundle]);

  if (!bundle || !ocrControl) return null;

  const channel: ChannelMode = channelDraft ?? ocrControl.ocrChannel;
  const ocrModelId = ocrModelDraft !== undefined ? ocrModelDraft : ocrControl.modelId;
  const structureModelId =
    structureModelDraft !== undefined ? structureModelDraft : structureControl?.modelId ?? null;
  const structureEnabled =
    structureEnabledDraft !== undefined ? structureEnabledDraft : structureControl?.isEnabled ?? true;

  const dirty =
    channelDraft !== undefined ||
    ocrModelDraft !== undefined ||
    structureModelDraft !== undefined ||
    structureEnabledDraft !== undefined;

  const handleSave = async () => {
    setSaving(true);
    try {
      const jobs: Array<Record<string, unknown>> = [];
      if (
        channelDraft !== undefined ||
        ocrModelDraft !== undefined ||
        channel !== ocrControl.ocrChannel ||
        ocrModelId !== ocrControl.modelId
      ) {
        jobs.push({
          feature_key: "ocr_screenshot",
          model_id: ocrModelId,
          provider_key_model_id: ocrControl.providerKeyModelId,
          system_prompt: ocrControl.systemPrompt,
          output_token_limit: ocrControl.outputTokenLimit,
          context_message_limit: ocrControl.contextMessageLimit,
          is_enabled: ocrControl.isEnabled,
          ocr_screenshot_channel: channel,
        });
      }
      if (structureControl) {
        const structureChanged =
          structureModelDraft !== undefined ||
          structureEnabledDraft !== undefined ||
          structureModelId !== structureControl.modelId ||
          structureEnabled !== structureControl.isEnabled;
        if (structureChanged) {
          jobs.push({
            feature_key: "ocr_screenshot_structure",
            model_id: structureModelId,
            provider_key_model_id: structureControl.providerKeyModelId,
            system_prompt: structureControl.systemPrompt,
            output_token_limit: structureControl.outputTokenLimit,
            context_message_limit: structureControl.contextMessageLimit,
            is_enabled: structureEnabled,
          });
        }
      }
      const results = await Promise.all(jobs.map((job) => saveFeatureControl(job)));
      if (results.every(Boolean)) {
        setChannelDraft(undefined);
        setOcrModelDraft(undefined);
        setStructureModelDraft(undefined);
        setStructureEnabledDraft(undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const archived = ocrControl.lifecycleState === "archived";

  return (
    <div className="rounded-2xl bg-white border border-[#E5E0D6] p-4 space-y-3.5">
      {/* 顶部标题行 + 状态 + 动作 */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-0.5 border-b border-[#E5E0D6]/40">
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
                {saving ? "保存中…" : dirty ? "保存修改" : "已保存"}
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

      {/* 识别通道切换分段器 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FAF8F4]/80 border border-[#E5E0D6]/70">
        <div className="space-y-0.5">
          <div className="text-[13px] font-medium text-[#1C1917]">识别通道策略</div>
          <div className="text-[11px] text-[#78716C]">
            {channel === "baidu"
              ? "百度 OCR 提取文本 + 归位大模型清洗结构，兼顾高准确率与低成本"
              : "单视觉大模型（Vision）直接处理原图，无需第三方 OCR 接口"}
          </div>
        </div>
        <div className="inline-flex p-0.5 rounded-lg bg-[#EAE5DC]/60 border border-[#E5E0D6]/80 shrink-0 select-none">
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
                  "h-7 px-3 rounded-md text-[12px] transition-all cursor-pointer",
                  active
                    ? "bg-white text-[#1C1917] font-medium shadow-2xs border border-[#E5E0D6]/60"
                    : "text-[#78716C] hover:text-[#1C1917]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 槽位排布 */}
      {channel === "baidu" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {structureControl && (
            <div className="rounded-xl border border-[#E5E0D6]/80 bg-[#FAF8F4]/30 p-3 space-y-2 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="screenshot-structure-model"
                    className="text-[13px] font-medium text-[#1C1917]"
                  >
                    归位模型 (Structure)
                  </Label>
                  <span className="flex items-center gap-1.5 text-[11px] text-[#78716C]">
                    允许使用
                    <Switch
                      aria-label="启用文字结构化"
                      checked={structureEnabled}
                      onCheckedChange={(checked) => setStructureEnabledDraft(checked)}
                    />
                  </span>
                </div>
                <p className="text-[11px] text-[#78716C] leading-normal">
                  百度提字后，由它负责将无序文字精准填入对应数据字段。
                </p>
              </div>
              <ModelChainSelect
                modelDirectory={modelDirectory}
                value={structureModelId}
                onChange={setStructureModelDraft}
                id="screenshot-structure-model"
              />
            </div>
          )}
          <div className="rounded-xl border border-[#E5E0D6]/80 bg-[#FAF8F4]/30 p-3 space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="screenshot-ocr-model"
                  className="text-[13px] font-medium text-[#1C1917]"
                >
                  备用看图模型 (Vision Fallback)
                </Label>
                <span className="text-[10px] text-[#78716C] bg-[#F5F3EE] px-1.5 py-0.5 rounded border border-[#E5E0D6]/60">
                  自动熔断兜底
                </span>
              </div>
              <p className="text-[11px] text-[#78716C] leading-normal">
                仅当百度 OCR 或归位失败时才介入，需支持图片识别输入。
              </p>
            </div>
            <ModelChainSelect
              modelDirectory={modelDirectory}
              value={ocrModelId}
              onChange={setOcrModelDraft}
              id="screenshot-ocr-model"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E5E0D6]/80 bg-[#FAF8F4]/30 p-3 space-y-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="screenshot-vision-model"
                className="text-[13px] font-medium text-[#1C1917]"
              >
                看图模型 (Vision Direct)
              </Label>
              <span className="text-[10px] text-[#78716C] bg-[#F5F3EE] px-1.5 py-0.5 rounded border border-[#E5E0D6]/60">
                一步到位
              </span>
            </div>
            <p className="text-[11px] text-[#78716C] leading-normal">
              直接分析截图并输出结构化数据，跳过外部 OCR 接口，需支持图片输入。
            </p>
          </div>
          <ModelChainSelect
            modelDirectory={modelDirectory}
            value={ocrModelId}
            onChange={setOcrModelDraft}
            id="screenshot-vision-model"
          />
        </div>
      )}
    </div>
  );
}
