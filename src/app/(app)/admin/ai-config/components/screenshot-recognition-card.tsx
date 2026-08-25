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

type ChannelMode = "baidu" | "vision";

/**
 * 截图识别合并卡片（纯逻辑版）：
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
    <div className="rounded-2xl bg-white border border-[#E5E0D6] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[#1C1917] font-medium text-[14px]">
          <Camera className="size-4 text-[#D97757]" />
          <span>截图识别</span>
          <Badge variant="secondary" className="bg-[#F5F3EE] text-[#292524] text-[10px] h-4.5 px-1.5 font-normal">
            首页核心
          </Badge>
          {archived ? (
            <Badge variant="outline" className="bg-[#F5F3EE] text-[#292524] border-[#E5E0D6] text-[11px] font-normal">
              已停止
            </Badge>
          ) : ocrControl.isEnabled ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#292524]">
              <span className="size-1.5 rounded-full bg-[#16A34A]" />
              使用中
            </span>
          ) : (
            <Badge variant="outline" className="bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/80 text-[11px] font-normal">
              已关闭
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {archived ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="恢复截图识别"
              className="h-7 px-2 text-[12px] text-[#292524] hover:bg-[#F5F3EE]"
              onClick={() => restoreFeature("ocr_screenshot")}
            >
              <ArchiveRestore className="size-3.5 mr-1 text-[#78716C]" />
              恢复
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="h-7 px-3 text-[12px] bg-white border border-[#E5E0D6] hover:bg-[#F5F3EE] text-[#292524]"
                disabled={!dirty || saving}
                onClick={handleSave}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="停止使用截图识别"
                className="h-7 px-2 text-[12px] text-[#78716C] hover:text-[#C9604D] hover:bg-[#F5F3EE]/50"
                onClick={() => archiveFeature("ocr_screenshot")}
              >
                <Archive className="size-3.5 mr-1 opacity-70" />
                停止
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>识别通道</Label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "baidu", label: "百度OCR + 模型归位" },
              { value: "vision", label: "视觉模型一步到位" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={channel === option.value}
              onClick={() => setChannelDraft(option.value)}
              className={`h-8 px-3 rounded-lg text-[13px] border transition-colors ${
                channel === option.value
                  ? "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/40 font-medium"
                  : "bg-white text-[#292524] border-[#E5E0D6] hover:bg-[#FBF9F5]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {channel === "baidu" ? (
        <div className="space-y-3">
          {structureControl && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>归位模型</Label>
                <span className="flex items-center gap-1.5 text-[12px] text-[#78716C]">
                  允许使用
                  <Switch
                    aria-label="启用文字结构化"
                    checked={structureEnabled}
                    onCheckedChange={(checked) => setStructureEnabledDraft(checked)}
                  />
                </span>
              </div>
              <ModelChainSelect
                modelDirectory={modelDirectory}
                value={structureModelId}
                onChange={setStructureModelDraft}
                id="screenshot-structure-model"
              />
              <p className="text-[12px] text-[#78716C]">百度提字后，由它把文字填进表格。</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>备用看图模型</Label>
            <ModelChainSelect
              modelDirectory={modelDirectory}
              value={ocrModelId}
              onChange={setOcrModelDraft}
              id="screenshot-ocr-model"
            />
            <p className="text-[12px] text-[#78716C]">百度或归位失败时才启用，需支持图片输入。</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>看图模型</Label>
          <ModelChainSelect
            modelDirectory={modelDirectory}
            value={ocrModelId}
            onChange={setOcrModelDraft}
            id="screenshot-vision-model"
          />
          <p className="text-[12px] text-[#78716C]">识别 + 归位一步完成，需支持图片输入。</p>
        </div>
      )}
    </div>
  );
}
