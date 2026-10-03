"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Settings2,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  ShieldCheck,
  ChevronRight,
  Info,
} from "lucide-react";
import { useAiConfig, type AiFeatureControl } from "../hooks/use-ai-config";
import { ScreenshotRecognitionCard } from "./screenshot-recognition-card";
import { ModelFamilySelect } from "./model-family-select";
import { BindingDialog } from "./bindings-dialogs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

export function BusinessFunctionsPanel() {
  const {
    bundle,
    saveFeatureControl,
    setGlobalDefaultModel,
    archiveFeature,
    restoreFeature,
  } = useAiConfig();

  const [bindingModal, setBindingModal] = useState<{
    open: boolean;
    data: AiFeatureControl | null;
  }>({
    open: false,
    data: null,
  });

  const [archiveModal, setArchiveModal] = useState<AiFeatureControl | null>(null);

  // 全局默认兜底设置
  const defaultBinding = bundle?.featureBindings.find((b) => b.feature_key === "default");
  const globalDefaultModelId = defaultBinding?.model_id || "deepseek-chat";

  // 活跃业务功能列表（排除截图识别，因为截图识别在上方作为专属看板置顶；排除 default）
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

  return (
    <div className="space-y-4">
      {/* 1. 核心重点卡片：截图识别与结构化提取 */}
      <ScreenshotRecognitionCard />

      {/* 2. 其它核心业务功能列表卡片 */}
      <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-xs">
        <div className="border-b border-[#E2E2DF]/60 bg-[#FCFCFB] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#D97757]" />
            <span className="text-[14px] font-medium text-[#1F1E1D]">
              业务模块调度列表
            </span>
          </div>
          <span className="text-[12px] text-[#78716C]">
            管理员选定模型系列后，系统自动挑选最佳可用密钥
          </span>
        </div>

        <div className="divide-y divide-[#E2E2DF]/50">
          {/* 全局默认兜底行 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#FAF9F5]/40 hover:bg-[#FAF9F5]/70 transition-colors">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[#141413]">
                  全局默认兜底
                </span>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[12px] font-normal bg-[#D97757]/10 text-[#D97757]">
                  ✦ 主干基座
                </span>
              </div>
              <p className="text-[12px] text-[#78716C]">
                未显式配置专属模型或主模型故障逃逸时，全站统一调用的兜底模型
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="w-52">
                <ModelFamilySelect
                  value={globalDefaultModelId}
                  onChange={handleGlobalDefaultChange}
                  allowEmptyLabel=""
                />
              </div>
              <Button
                variant="outline"
                size="s"
                className="h-8.5 px-3 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                onClick={() => {
                  const defCtrl = bundle?.featureControls.find((c) => c.key === "default");
                  if (defCtrl) setBindingModal({ open: true, data: defCtrl });
                }}
              >
                切换
              </Button>
            </div>
          </div>

          {/* 活跃业务功能列表 */}
          {businessFeatures.map((feature) => (
            <div
              key={feature.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-[#FCFCFB] transition-colors"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[#1F1E1D]">
                    {feature.label}
                  </span>
                  {feature.isEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.2 text-[12px] font-normal bg-[#10B981]/10 text-[#10B981]">
                      <span className="size-1.5 rounded-full bg-[#10B981]" />
                      运行中
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.2 text-[12px] font-normal bg-[#F1F1F0] text-[#78716C]">
                      <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                      已暂停
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#78716C]">{feature.description}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="w-52">
                  <ModelFamilySelect
                    value={feature.modelId}
                    onChange={(mId) => handleModelChange(feature.key, mId)}
                    allowEmptyLabel="跟随全局默认兜底"
                  />
                </div>
                <Button
                  variant="outline"
                  size="s"
                  className="h-8.5 px-2.5 text-[12px] text-[#78716C] border-[#E2E2DF] hover:text-[#1F1E1D] hover:bg-[#EBEBE9]"
                  onClick={() => setBindingModal({ open: true, data: feature })}
                >
                  <Settings2 className="size-3.5 mr-1" />
                  调整
                </Button>
                <Button
                  variant="ghost"
                  size="s"
                  className="h-8.5 px-2 text-[12px] text-[#78716C] hover:text-status-danger hover:bg-[#EBEBE9]/60"
                  onClick={() => setArchiveModal(feature)}
                  title="停用该功能"
                >
                  <Archive className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
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
            await archiveFeature(archiveModal.key);
            feedbackToast.success(`已停止「${archiveModal.label}」`);
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
