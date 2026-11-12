"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Settings2,
  Archive,
  ArchiveRestore,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  Gauge,
} from "lucide-react";
import { useAiConfig, type AiFeatureControl } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { ModelFamilySelect } from "./model-family-select";
import { BindingDialog } from "./bindings-dialogs";
import { OcrSpeedDrawer } from "./ocr-speed-drawer";
import { DangerousActionDialog, type ImpactConfirmationState } from "./dangerous-action-dialog";
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
import { feedbackToast } from "@/components/ui/feedback-toast";
import { AI_CONFIG_MESSAGES, formatLatency } from "@/lib/ai-config/presentation";
import type { BusinessAssuranceItem } from "@/lib/ai-config/availability";
import { cn } from "@/lib/utils";

/**
 * 格式化业务状态文案
 */
function renderBusinessStatus(
  assurance: BusinessAssuranceItem | undefined,
  modelFamilyNameMap: Record<string, string>
) {
  if (!assurance) {
    return (
      <span className="text-[12px] text-[#A8A29E]">未接入监控</span>
    );
  }

  const { routingStatus, messageKey, selectedModelId, preferredModelId } = assurance;
  const rawTemplate = AI_CONFIG_MESSAGES[messageKey] || "状态未知";

  const preferredName = preferredModelId
    ? modelFamilyNameMap[preferredModelId] || preferredModelId
    : "无可用模型";
  const selectedName = selectedModelId
    ? modelFamilyNameMap[selectedModelId] || selectedModelId
    : "全局默认";

  const text = rawTemplate
    .replace("{preferredModelName}", preferredName)
    .replace("{selectedModelName}", selectedName);

  if (routingStatus === "outage") {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-status-danger-text">
        <AlertCircle className="size-3.5 shrink-0 text-status-danger" />
        <span className="font-normal">{text}</span>
      </span>
    );
  }

  if (routingStatus === "fallback") {
    // 顶班不是故障，不许标红，用温和警示墨度
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-[#8A6A2F]">
        <Clock className="size-3.5 shrink-0 text-[#8A6A2F]" />
        <span className="font-normal">{text}</span>
      </span>
    );
  }

  // normal
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-[#4B6B4E]">
      <CheckCircle2 className="size-3.5 shrink-0 text-[#4B6B4E]" />
      <span className="font-normal text-[#1F1E1D]">{text}</span>
    </span>
  );
}

export function BusinessFunctionsPanel() {
  const { bundle, runCommand } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  const [bindingModal, setBindingModal] = useState<{
    open: boolean;
    data: AiFeatureControl | null;
  }>({
    open: false,
    data: null,
  });

  const [archiveModal, setArchiveModal] = useState<AiFeatureControl | null>(null);
  const [testingOcr, setTestingOcr] = useState(false);
  const [speedDrawerOpen, setSpeedDrawerOpen] = useState(false);
  const [impactConfirm, setImpactConfirm] = useState<ImpactConfirmationState>(null);

  // 全局默认兜底设置
  const defaultBinding = bundle?.featureBindings.find((b) => b.feature_key === "default");
  const globalDefaultModelId = defaultBinding?.model_id ?? report?.globalDefaultModelId ?? null;

  // 模型名映射表
  const modelFamilyNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (report?.modelFamilies) {
      for (const f of report.modelFamilies) {
        map[f.modelId] = f.displayName;
      }
    }
    return map;
  }, [report]);

  // 业务保障字典
  const assuranceMap = useMemo(() => {
    const map: Record<string, BusinessAssuranceItem> = {};
    if (report?.businessAssurances) {
      for (const a of report.businessAssurances) {
        map[a.key] = a;
      }
    }
    return map;
  }, [report]);

  // 截图识别配置
  const ocrControl = useMemo(() => {
    return bundle?.featureControls.find((c) => c.key === "ocr_screenshot") ?? null;
  }, [bundle]);

  // 活跃业务功能列表
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

  // 统一带确认执行命令
  const executeWithConfirm = useCallback(
    async (
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
    },
    [runCommand]
  );

  const handleModelChange = async (featureKey: string, nextModelId: string | null) => {
    const ctrl = bundle?.featureControls.find((c) => c.key === featureKey);
    if (!ctrl) return;
    await executeWithConfirm(
      "save_feature_control",
      {
        feature_key: ctrl.key,
        model_id: nextModelId,
        system_prompt: ctrl.systemPrompt,
        output_token_limit: ctrl.outputTokenLimit,
        context_message_limit: ctrl.contextMessageLimit,
        is_enabled: ctrl.isEnabled,
      },
      undefined,
      `已更新「${ctrl.label}」模型调度`
    );
  };

  const handleGlobalDefaultChange = async (nextModelId: string | null) => {
    if (!nextModelId) return;
    await executeWithConfirm(
      "set_global_default_model",
      { model_id: nextModelId },
      undefined,
      "已更新全局默认 AI 模型"
    );
  };

  const handleOcrModelChange = async (newModelId: string | null) => {
    if (!ocrControl) return;
    await executeWithConfirm(
      "save_feature_control",
      {
        feature_key: "ocr_screenshot",
        model_id: newModelId,
        system_prompt: ocrControl.systemPrompt,
        output_token_limit: ocrControl.outputTokenLimit,
        context_message_limit: ocrControl.contextMessageLimit,
        is_enabled: ocrControl.isEnabled,
        ocr_screenshot_channel: ocrControl.ocrChannel,
      },
      undefined,
      "已更新截图识别模型调度"
    );
  };

  const handleOcrTrialRun = async () => {
    if (!bundle || !ocrControl) return;
    setTestingOcr(true);
    try {
      const res = await runCommand("test_key", { feature_key: "ocr_screenshot" });
      if (!res.ok) {
        feedbackToast.error(`试跑未通过: ${res.error || "服务无响应"}`, { duration: 6000 });
        return;
      }
      const testRes = (res.body as Record<string, unknown>).testResult as
        | { ok?: boolean; model?: string; channelLabel?: string; channelName?: string; latencyMs?: number; message?: string }
        | undefined;
      if (!testRes?.ok) {
        feedbackToast.error(`试跑未通过: ${testRes?.message || "服务未返回测试结果"}`, { duration: 6000 });
        return;
      }
      const modelLabel = testRes?.model ? (modelFamilyNameMap[testRes.model] || testRes.model) : "自动调度";
      const keyLabel = testRes?.channelLabel || testRes?.channelName || "可用渠道";
      const latencyText = testRes?.latencyMs ? ` · 耗时 ${formatLatency(testRes.latencyMs)}` : "";
      feedbackToast.success(`试跑连通正常 · ${modelLabel} · 渠道「${keyLabel}」${latencyText}`);
    } finally {
      setTestingOcr(false);
    }
  };

  const handleSaveAdvanced = async (data: Record<string, unknown>) => {
    return await executeWithConfirm(
      "save_feature_control",
      data,
      undefined,
      "已更新业务功能高级配置"
    );
  };

  const handleConfirmArchive = async () => {
    if (!archiveModal) return;
    const target = archiveModal;
    setArchiveModal(null);
    await executeWithConfirm(
      "archive_feature",
      { feature_key: target.key },
      undefined,
      `已停用「${target.label}」`
    );
  };

  const handleRestore = async (ctrl: AiFeatureControl) => {
    await executeWithConfirm(
      "restore_feature",
      { feature_key: ctrl.key },
      undefined,
      `已恢复「${ctrl.label}」`
    );
  };

  return (
    <div className="space-y-6">
      {/* 桌面端高密表格 */}
      <div className="hidden rounded-xl border border-[#E2E2DF] bg-white md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E2E2DF] bg-[#F7F7F6]/60">
              <TableHead className="w-[200px] text-[12px] text-[#78716C] pl-4">业务功能</TableHead>
              <TableHead className="w-[260px] text-[12px] text-[#78716C]">模型调度</TableHead>
              <TableHead className="text-[12px] text-[#78716C]">现在状态</TableHead>
              <TableHead className="w-[140px] text-right text-[12px] text-[#78716C] pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 1. 全局默认兜底设置行 */}
            <TableRow className="border-b border-[#E2E2DF] bg-[#FCFCFB]/60 hover:bg-[#F7F7F6]/60">
              <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                  <span className="font-normal text-[14px] text-[#141413]">全局默认 AI 模型</span>
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#D97757]/10 text-[#D97757]">
                    默认兜底
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#78716C]">
                  所有未明确指定模型、或所选模型不可用时的统一跨模型顶班兜底
                </p>
              </TableCell>
              <TableCell>
                <ModelFamilySelect
                  value={globalDefaultModelId}
                  onChange={handleGlobalDefaultChange}
                  allowEmptyLabel={null}
                  triggerTitle="全局默认必须指定模型"
                />
              </TableCell>
              <TableCell>
                {renderBusinessStatus(assuranceMap["default"], modelFamilyNameMap)}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <span className="text-[12px] text-[#78716C]">基石配置</span>
              </TableCell>
            </TableRow>

            {/* 2. 截图识别专属置顶行 */}
            {ocrControl && (
              <TableRow className="border-b border-[#E2E2DF] hover:bg-[#F7F7F6]/60">
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2">
                    <span className="font-normal text-[14px] text-[#141413]">
                      {ocrControl.label}
                    </span>
                    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#D97757]/10 text-[#D97757]">
                      核心
                    </span>
                    <button
                      type="button"
                      onClick={() => setSpeedDrawerOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#EEF2F5] text-[#43718E] hover:bg-[#E2E2DF] transition-colors"
                      title="查看截图识别测速台账"
                    >
                      <Gauge className="size-3" />
                      测速台账
                    </button>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[#78716C]">
                    {ocrControl.description}
                  </p>
                </TableCell>
                <TableCell>
                  <ModelFamilySelect
                    value={ocrControl.modelId}
                    onChange={handleOcrModelChange}
                    allowEmptyLabel="跟随全局默认"
                  />
                </TableCell>
                <TableCell>
                  {renderBusinessStatus(assuranceMap["ocr_screenshot"], modelFamilyNameMap)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-s"
                      onClick={() => setSpeedDrawerOpen(true)}
                      className="size-7 text-[#78716C] hover:text-[#141413]"
                      title="测速台账"
                    >
                      <Gauge className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-s"
                      onClick={handleOcrTrialRun}
                      disabled={testingOcr}
                      className="size-7 text-[#78716C] hover:text-[#141413]"
                      title="快速连通性试跑"
                    >
                      <Play className={cn("size-3.5", testingOcr && "animate-spin")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-s"
                      onClick={() => setBindingModal({ open: true, data: ocrControl })}
                      className="size-7 text-[#78716C] hover:text-[#141413]"
                      title="高级配置"
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* 3. 普通活跃业务功能列表 */}
            {businessFeatures.map((ctrl) => {
              const assurance = assuranceMap[ctrl.key];
              return (
                <TableRow key={ctrl.key} className="border-b border-[#E2E2DF] hover:bg-[#F7F7F6]/60">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <span className="font-normal text-[14px] text-[#141413]">
                        {ctrl.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-[#78716C]">
                      {ctrl.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <ModelFamilySelect
                      value={ctrl.modelId}
                      onChange={(nextId) => handleModelChange(ctrl.key, nextId)}
                      allowEmptyLabel="跟随全局默认"
                    />
                  </TableCell>
                  <TableCell>
                    {renderBusinessStatus(assurance, modelFamilyNameMap)}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-s"
                        onClick={() => setBindingModal({ open: true, data: ctrl })}
                        className="size-7 text-[#78716C] hover:text-[#141413]"
                        title="高级参数设置"
                      >
                        <Settings2 className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-s"
                        onClick={() => setArchiveModal(ctrl)}
                        className="size-7 text-[#78716C] hover:text-status-danger"
                        title="停用此业务功能"
                      >
                        <Archive className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 移动端卡片视图 */}
      <div className="space-y-3 md:hidden">
        {/* 全局默认卡片 */}
        <div className="rounded-xl border border-[#E2E2DF] bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-normal text-[14px] text-[#141413]">全局默认 AI 模型</span>
            <span className="rounded-md bg-[#D97757]/10 px-1.5 py-0.5 text-[12px] text-[#D97757]">
              默认兜底
            </span>
          </div>
          <p className="text-[12px] text-[#78716C]">
            未明确指定模型时的统一顶班兜底
          </p>
          <ModelFamilySelect
            value={globalDefaultModelId}
            onChange={handleGlobalDefaultChange}
            allowEmptyLabel={null}
          />
          <div className="pt-1">
            {renderBusinessStatus(assuranceMap["default"], modelFamilyNameMap)}
          </div>
        </div>

        {/* 业务功能卡片 */}
        {businessFeatures.map((ctrl) => (
          <div key={ctrl.key} className="rounded-xl border border-[#E2E2DF] bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-normal text-[14px] text-[#141413]">{ctrl.label}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-s"
                  onClick={() => setBindingModal({ open: true, data: ctrl })}
                  className="size-6 text-[#78716C]"
                >
                  <Settings2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-s"
                  onClick={() => setArchiveModal(ctrl)}
                  className="size-6 text-[#78716C] hover:text-status-danger"
                >
                  <Archive className="size-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-[12px] text-[#78716C]">{ctrl.description}</p>
            <ModelFamilySelect
              value={ctrl.modelId}
              onChange={(nextId) => handleModelChange(ctrl.key, nextId)}
              allowEmptyLabel="跟随全局默认"
            />
            <div className="pt-1">
              {renderBusinessStatus(assuranceMap[ctrl.key], modelFamilyNameMap)}
            </div>
          </div>
        ))}
      </div>

      {/* 已停用/已归档功能抽屉 */}
      {archivedFeatures.length > 0 && (
        <div className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-4">
          <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-3">
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-[#78716C]" />
              <span className="text-[14px] text-[#1F1E1D]">已停用的业务功能 ({archivedFeatures.length})</span>
            </div>
          </div>
          <div className="divide-y divide-[#E2E2DF]/40">
            {archivedFeatures.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-[13px] text-[#78716C]">{f.label}</span>
                  <span className="ml-2 font-mono text-[12px] text-[#78716C]">{f.key}</span>
                </div>
                <Button
                  variant="outline"
                  size="s"
                  onClick={() => handleRestore(f)}
                  className="h-7 text-[12px] border-[#E2E2DF]"
                >
                  <ArchiveRestore className="size-3 mr-1" />
                  恢复功能
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 高级参数设置弹窗 */}
      <BindingDialog
        control={bindingModal.data}
        open={bindingModal.open}
        onOpenChange={(open) => setBindingModal((prev) => ({ ...prev, open }))}
        onSave={handleSaveAdvanced}
      />

      {/* 停用功能确认弹窗 */}
      <ConfirmDialog
        open={Boolean(archiveModal)}
        onOpenChange={(open) => !open && setArchiveModal(null)}
        title="停用业务功能确认"
        description={`停用「${archiveModal?.label}」后，该业务将无法发起新的 AI 请求。已有的配置将被保留，随时可恢复。`}
        confirmText="确认停用"
        cancelText="取消"
        onConfirm={handleConfirmArchive}
      />

      {/* 统一高风险影响确认弹窗 */}
      <DangerousActionDialog
        state={impactConfirm}
        onClose={() => setImpactConfirm(null)}
      />

      {/* 截图识别测速台账抽屉 */}
      <OcrSpeedDrawer
        open={speedDrawerOpen}
        onOpenChange={setSpeedDrawerOpen}
      />
    </div>
  );
}
