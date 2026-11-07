"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useAiConfig, AI_MODEL_BATCH_TIMEOUT_MS, startDetectionRefresh } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { useFrozenOrder } from "../hooks/use-frozen-order";
import { compareChannelModels, compareChannels } from "@/lib/ai-config/list-order";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Play,
  Trash2,
  RefreshCw,
  Edit2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { DangerousActionDialog, type ImpactConfirmationState } from "./dangerous-action-dialog";
import { ModelTestFeedback } from "./model-test-feedback";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { formatSleepCountdown, AI_CONFIG_MESSAGES, CHANNEL_IDENTITY_PRESENTATION } from "@/lib/ai-config/presentation";
import type { AvailabilityChannel, AvailabilityKeySummary } from "@/lib/ai-config/availability";
import type { ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { cn } from "@/lib/utils";

export interface ChannelPoolViewProps {
  onOpenSyncModal: (keyId: string, label: string) => void;
}

export function ChannelPoolView({ onOpenSyncModal }: ChannelPoolViewProps) {
  const { bundle, runCommand, loadData } = useAiConfig();
  const report = useAvailabilityReport(bundle);
  const [detectionState, setDetectionState] = useState<"idle" | "reading" | "stopped">("idle");
  const detectionRefreshRef = useRef<{ stop: () => void } | null>(null);
  const channelTestSeq = useRef(0);

  useEffect(() => () => {
    detectionRefreshRef.current?.stop();
  }, []);

  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [impactConfirm, setImpactConfirm] = useState<ImpactConfirmationState>(null);

  // 内联编辑状态
  const [editingField, setEditingField] = useState<"label" | "api_key" | "base_url" | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 检测渠道状态
  const [isTestingChannel, setIsTestingChannel] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    message?: string;
    failureDiagnostic?: ChannelFailureDiagnostic;
  } | null>(null);

  // 渠道列表
  // 进入渠道视角时排一次：开着的在上、关掉的在下；页面内操作期间位置不变
  const channels = useFrozenOrder(bundle?.keys ?? [], (key) => key.id, compareChannels);

  const selectedChannel = useMemo(() => {
    if (channels.length === 0) return null;
    return channels.find((c) => c.id === selectedKeyId) ?? channels[0];
  }, [channels, selectedKeyId]);

  const selectedProvider = useMemo(() => {
    if (!selectedChannel || !bundle?.providers) return null;
    return bundle.providers.find((p) => p.id === selectedChannel.provider_id) ?? null;
  }, [selectedChannel, bundle]);

  // 选中渠道的挂载模型
  const mountedModels = useMemo(() => {
    if (!selectedChannel || !bundle?.models) return [];
    return bundle.models.filter((m) => m.key_id === selectedChannel.id);
  }, [selectedChannel, bundle]);
  // 换渠道时排一次：勾选的在上、没勾的在下；勾选/取消时位置不变
  const channelModels = useFrozenOrder(mountedModels, (model) => model.id, compareChannelModels, selectedChannel?.id ?? "");

  // 渠道治理状态映射
  const keyGovernanceMap = useMemo(() => {
    const map: Record<string, AvailabilityKeySummary> = {};
    if (report?.keys) {
      for (const k of report.keys) {
        map[k.keyId] = k;
      }
    }
    return map;
  }, [report]);

  // 当前渠道每个供应模型的五态，直接复用同源可用性报告，不另算一套。
  const modelStateByRowId = useMemo(() => {
    const map: Record<string, AvailabilityChannel> = {};
    if (selectedChannel && report?.modelFamilies) {
      for (const family of report.modelFamilies) {
        for (const channel of family.channels) {
          if (channel.keyId === selectedChannel.id) map[channel.keyModelId] = channel;
        }
      }
    }
    return map;
  }, [report, selectedChannel]);

  const selectedGov = selectedChannel ? keyGovernanceMap[selectedChannel.id] : undefined;
  const failureDiagnostic = selectedChannel?.failureDiagnostic;

  // 统一带确认执行命令
  const executeWithConfirm = async (
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

    // 409 共享地址影响
    if (res.status === 409 && res.sharedAddressImpact) {
      setImpactConfirm({
        type: "shared_address",
        impact: res.sharedAddressImpact,
        onConfirm: async () => {
          const retryRes = await runCommand(action, { ...data, confirm_shared_address: true }, entity);
          if (retryRes.ok) {
            if (successMsg) feedbackToast.success(successMsg);
          } else {
            feedbackToast.error(retryRes.error || "操作失败");
          }
        },
      });
      return false;
    }

    // 409 业务停摆影响
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
  };

  const handleStartEdit = (field: "label" | "api_key" | "base_url") => {
    setEditingField(field);
    if (field === "label") setEditingValue(selectedChannel?.label ?? "");
    else if (field === "api_key") setEditingValue("");
    else if (field === "base_url") setEditingValue(selectedProvider?.base_url ?? "");
  };

  const handleSaveEdit = async () => {
    if (!selectedChannel) return;
    const trimmed = editingValue.trim();

    setIsSavingEdit(true);
    try {
      if (editingField === "label") {
        if (!trimmed) {
          feedbackToast.error("渠道名称不能为空");
          return;
        }
        await executeWithConfirm("update", { id: selectedChannel.id, label: trimmed }, "key", "已修改渠道名称");
      } else if (editingField === "api_key") {
        if (!trimmed) {
          feedbackToast.error("密钥不能为空");
          return;
        }
        await executeWithConfirm("update", { id: selectedChannel.id, api_key: trimmed }, "key", "已更新渠道密钥");
      } else if (editingField === "base_url") {
        if (!trimmed) {
          feedbackToast.error("API 地址不能为空");
          return;
        }
        // S7 改 API 地址支持 409 sharedAddressImpact 确认
        await executeWithConfirm("update", { id: selectedChannel.id, base_url: trimmed }, "key", "已更新 API 地址");
      }
      setEditingField(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 渠道总开关
  const handleToggleKeyEnable = async (keyId: string, enabled: boolean) => {
    await executeWithConfirm(
      "update",
      { id: keyId, is_enabled: enabled },
      "key",
      enabled ? "已开启该渠道" : "已停用该渠道"
    );
  };

  // 删除渠道
  const handleDeleteKey = async (keyId: string) => {
    await executeWithConfirm("delete", { id: keyId }, "key", "已删除渠道");
  };

  // 检测此渠道：测当前勾选在供的模型，不再盲抽第 1 个挂载模型。
  const handleTestKey = async () => {
    if (!selectedChannel) return;
    const testedKeyId = selectedChannel.id;
    const seq = channelTestSeq.current + 1;
    channelTestSeq.current = seq;
    setIsTestingChannel(true);
    setTestResult(null);
    setDetectionState("idle");
    detectionRefreshRef.current?.stop();
    detectionRefreshRef.current = startDetectionRefresh({
      loadData,
      onWindowEnd: () => {
        if (seq === channelTestSeq.current) setDetectionState("stopped");
      },
      onReadError: () => feedbackToast.error("检测中最新状态读取失败，页面可能仍是旧数据。", { duration: 6000 }),
    });
    try {
      const res = await runCommand("test_key_all_models", { key_id: testedKeyId }, undefined, AI_MODEL_BATCH_TIMEOUT_MS);
      detectionRefreshRef.current?.stop();
      if (seq !== channelTestSeq.current) return;
      if (res.ok) {
        const body = res.body as {
          total?: number;
          successCount?: number;
          failureCount?: number;
          allPassed?: boolean;
          stateWriteError?: string | null;
          results?: Array<{
            modelId: string;
            ok: boolean;
            error?: string | null;
            failureDiagnostic?: ChannelFailureDiagnostic | null;
          }>;
        };
        const total = body.total ?? 0;
        const failures = (body.results ?? []).filter((result) => !result.ok);
        if (total === 0) {
          setTestResult({ ok: false, message: "该渠道当前没有勾选在供的模型，未执行检测" });
          feedbackToast.warning("该渠道当前没有勾选在供的模型");
          return;
        }
        const passed = body.allPassed === true || failures.length === 0;
        const firstFailure = failures[0];
        const message = passed
          ? undefined
          : `共测 ${total} 个在供模型，${failures.length} 个未通过：${failures.map((result) => result.modelId).join("、")}${firstFailure?.error ? `；首个原因：${firstFailure.error}` : ""}`;
        setTestResult({
          ok: passed,
          message,
          failureDiagnostic: firstFailure?.failureDiagnostic ?? undefined,
        });
        if (passed) {
          feedbackToast.success("渠道检测通过，已恢复能用");
        } else {
          feedbackToast.error(`检测未通过：${firstFailure?.error || "服务异常"}`, { duration: 6000 });
        }
        if (body.stateWriteError) {
          feedbackToast.error(`测试结果未能写入渠道状态：${body.stateWriteError}`, { duration: 6000 });
        }
        const finalReadOk = await loadData(true, true);
        if (!finalReadOk) {
          feedbackToast.error("最终状态未同步，请点击「重新读取最新状态」。", { duration: 6000 });
        }
      } else {
        feedbackToast.error(`检测失败: ${res.error || "服务无响应"}`, { duration: 6000 });
        setTestResult({
          ok: false,
          message: res.error,
          failureDiagnostic: res.testResult as ChannelFailureDiagnostic | undefined,
        });
      }
    } catch (error) {
      if (seq === channelTestSeq.current) {
        setDetectionState("reading");
        feedbackToast.error(
          `检测未完整收齐：${error instanceof Error ? error.message : "请求中断"}。后台可能仍在完成，页面会自动读取已落库状态。`,
          { duration: 6000 },
        );
      }
    } finally {
      setIsTestingChannel(false);
    }
  };

  const handleReloadAfterDetection = async () => {
    const ok = await loadData(true, true);
    if (ok) feedbackToast.success("已读取最新状态");
    else feedbackToast.error("读取失败，页面未同步最新状态", { duration: 6000 });
  };

  // 模型勾选（取消勾选只是关闭，不删除）
  const handleToggleModelSelection = async (modelId: string, willEnable: boolean) => {
    if (!selectedChannel) return;
    const currentEnabledIds = channelModels.filter((m) => m.is_enabled).map((m) => m.model_id);
    const nextIds = willEnable
      ? Array.from(new Set([...currentEnabledIds, modelId]))
      : currentEnabledIds.filter((id) => id !== modelId);

    await executeWithConfirm(
      "set_key_model_selection",
      { key_id: selectedChannel.id, model_ids: nextIds },
      undefined,
      "已更新该渠道模型勾选"
    );
  };

  if (channels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E2E2DF] p-6 text-center text-[12px] text-[#78716C]">
        暂未接入渠道。点击上方「接入新渠道」添加上游服务商。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
      {/* 左侧：渠道列表（无 #N 序号，无顺位说明） */}
      <div className="md:col-span-4 rounded-xl border border-[#E2E2DF] bg-white p-2 space-y-1 self-start">
        <div className="text-[12px] text-[#78716C] px-2 py-1 font-normal">
          已接入渠道 ({channels.length})
        </div>
        <div className="space-y-1">
          {channels.map((ch) => {
            const gov = keyGovernanceMap[ch.id];
            const isSelected = selectedChannel?.id === ch.id;
            const isEnabled = ch.is_enabled;
            const isInvalid = gov?.identity === "invalid";
            const isSleeping = gov?.identity === "sleeping";
            const isRetest = gov?.identity === "retest";
            const isUsable = gov?.identity === "active";

            return (
              <div
                key={ch.id}
                role="button"
                tabIndex={0}
                data-slot="ai-key-item"
                onClick={() => {
                  channelTestSeq.current += 1;
                  setSelectedKeyId(ch.id);
                  setEditingField(null);
                  setTestResult(null);
                  setDetectionState("idle");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    channelTestSeq.current += 1;
                    setSelectedKeyId(ch.id);
                    setEditingField(null);
                    setTestResult(null);
                    setDetectionState("idle");
                  }
                }}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-2 text-left transition-colors cursor-pointer select-none",
                  isSelected
                    ? "bg-[#F1F1F0] border border-[#78716C]/40"
                    : "border border-transparent hover:bg-[#F7F7F6]"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-normal text-[13px] text-[#141413] truncate">
                    {ch.label || "未命名渠道"}
                  </span>
                  <span className="text-[12px] text-[#78716C] truncate shrink">
                    ({bundle?.providers.find((p) => p.id === ch.provider_id)?.name || "未知接入点"} · {ch.available_models?.length ?? 0} 个模型)
                  </span>
                </div>

                <div className="shrink-0 pl-2">
                  {!isEnabled ? (
                    <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#78716C]">
                      {AI_CONFIG_MESSAGES["channel.disabled"]}
                    </span>
                  ) : isInvalid ? (
                    <span className="rounded-md bg-status-danger/[0.10] px-1.5 py-0.5 text-[12px] text-status-danger-text">
                      {AI_CONFIG_MESSAGES["channel.action_required"]}
                    </span>
                  ) : isSleeping ? (
                    <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#78716C]">
                      {AI_CONFIG_MESSAGES["channel.cooling"]}
                    </span>
                  ) : isRetest ? (
                    <span className="rounded-md bg-[#8A6A2F]/10 px-1.5 py-0.5 text-[12px] text-[#8A6A2F]">
                      {AI_CONFIG_MESSAGES["channel.retest"]}
                    </span>
                  ) : isUsable ? (
                    <span className="rounded-md bg-[#4B6B4E]/10 px-1.5 py-0.5 text-[12px] text-[#4B6B4E]">
                      {AI_CONFIG_MESSAGES["channel.usable"]}
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#78716C]">
                      {AI_CONFIG_MESSAGES["channel.usable"]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧：渠道详情 */}
      {selectedChannel && (
        <div className="md:col-span-8 rounded-xl border border-[#E2E2DF] bg-white p-4 space-y-3">
          {/* 详情头部 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF]/60 pb-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-normal text-[14px] text-[#141413]">
                  {selectedChannel.label || "未命名渠道"}
                </span>
                {selectedGov && (
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[12px]",
                      !selectedChannel.is_enabled
                        ? "bg-[#F1F1F0] text-[#78716C]"
                        : selectedGov.identity === "invalid"
                        ? "bg-status-danger/[0.10] text-status-danger-text"
                        : selectedGov.identity === "sleeping"
                        ? "bg-[#F1F1F0] text-[#78716C]"
                        : selectedGov.identity === "retest"
                        ? "bg-[#8A6A2F]/10 text-[#8A6A2F]"
                        : "bg-[#4B6B4E]/10 text-[#4B6B4E]"
                    )}
                  >
                    {!selectedChannel.is_enabled
                      ? AI_CONFIG_MESSAGES["channel.disabled"]
                      : selectedGov.identity === "invalid"
                      ? AI_CONFIG_MESSAGES["channel.action_required"]
                      : selectedGov.identity === "sleeping"
                      ? `${AI_CONFIG_MESSAGES["channel.cooling"]} · ${formatSleepCountdown(selectedGov.sleepUntil)}`
                      : selectedGov.identity === "retest"
                      ? AI_CONFIG_MESSAGES["channel.retest"]
                      : AI_CONFIG_MESSAGES["channel.usable"]}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[#78716C]">
                接入点：{selectedProvider?.name || "未指定"} · ID: {selectedChannel.id}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* 检测此渠道 */}
              <Button
                variant="outline"
                size="s"
                disabled={isTestingChannel || !selectedChannel.is_enabled}
                onClick={handleTestKey}
                className="h-7 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
              >
                <Play className={cn("size-3.5", isTestingChannel && "animate-spin")} />
                <span>{isTestingChannel ? "检测中…" : "检测此渠道"}</span>
              </Button>

              {/* 渠道总开关 */}
              <Switch
                checked={selectedChannel.is_enabled}
                onCheckedChange={(checked) => handleToggleKeyEnable(selectedChannel.id, checked)}
                aria-label="开关此渠道"
              />

              {/* 删除渠道 */}
              <Button
                variant="ghost"
                size="icon-s"
                onClick={() => handleDeleteKey(selectedChannel.id)}
                className="size-7 text-[#A8A29E] hover:text-status-danger"
                title="删除渠道"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* 检测反馈 */}
          {testResult && (
            <ModelTestFeedback
              result={{
                ok: testResult.ok,
                latencyMs: testResult.latencyMs ?? 0,
                message: testResult.message,
                failureDiagnostic: testResult.failureDiagnostic,
              }}
              onDismiss={() => setTestResult(null)}
            />
          )}

          {/* 检测未完整收齐：保留说明和手动重新读取入口 */}
          {detectionState !== "idle" && (
            <div
              data-slot="ai-detection-interrupted"
              className="rounded-xl border border-[#8A6A2F]/30 bg-[#8A6A2F]/[0.04] px-3 py-2 text-[12px] text-[#78716C] flex flex-wrap items-center justify-between gap-2"
            >
              <span>
                {detectionState === "reading"
                  ? "检测未完整收齐：请求已中断，后台可能仍在完成，正在读取已落库状态…"
                  : "检测未完整收齐：已停止自动读取，后台可能仍在完成。请手动重新读取最新状态。"}
              </span>
              <Button
                size="s"
                variant="outline"
                onClick={handleReloadAfterDetection}
                className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
              >
                重新读取最新状态
              </Button>
            </div>
          )}

          {/* 需要你处理 / 暂歇 / 待复测：原因常驻，不让人去追气泡 */}
          {selectedGov && (selectedGov.identity === "invalid" || selectedGov.identity === "sleeping" || selectedGov.identity === "retest") && failureDiagnostic && (
            <div className={cn(
              "rounded-xl border p-3 text-[12px] space-y-1",
              selectedGov.identity === "invalid"
                ? "border-status-danger/30 bg-status-danger/[0.04] text-status-danger-text"
                : "border-[#E2E2DF] bg-[#F7F7F6] text-[#78716C]",
            )}>
              <div className="flex items-center gap-2 font-normal">
                <AlertCircle className={cn("size-4 shrink-0", selectedGov.identity === "invalid" ? "text-status-danger" : "text-[#8A6A2F]")} />
                <span>
                  {selectedGov.identity === "invalid" ? "需要你处理：" : "上次失败原因："}
                  {failureDiagnostic.technical?.message || "渠道连通性异常"}
                </span>
              </div>
            </div>
          )}

          {/* 属性编辑区 */}
          <div className="rounded-xl border border-[#E2E2DF] bg-white divide-y divide-[#E2E2DF]/60 text-[12px]">
            {/* 1. 渠道名称 */}
            <div className="px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-[#78716C] w-24 shrink-0">渠道名称</span>
              {editingField === "label" ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="h-7 text-[12px] border-[#E2E2DF] flex-1 max-w-sm"
                    autoFocus
                  />
                  <Button size="icon-s" variant="ghost" disabled={isSavingEdit} onClick={handleSaveEdit} className="size-6 text-[#4B6B4E]">
                    <Check className="size-3" />
                  </Button>
                  <Button size="icon-s" variant="ghost" disabled={isSavingEdit} onClick={() => setEditingField(null)} className="size-6 text-[#78716C]">
                    <X className="size-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-[#141413]">{selectedChannel.label || "—"}</span>
                  <Button size="icon-s" variant="ghost" onClick={() => handleStartEdit("label")} className="size-6 text-[#78716C]">
                    <Edit2 className="size-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* 2. API 地址 (S7 支持共享地址提示) */}
            <div className="px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-[#78716C] w-24 shrink-0">API 地址</span>
              {editingField === "base_url" ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="h-7 text-[12px] border-[#E2E2DF] flex-1 max-w-sm font-mono"
                    autoFocus
                  />
                  <Button size="icon-s" variant="ghost" disabled={isSavingEdit} onClick={handleSaveEdit} className="size-6 text-[#4B6B4E]">
                    <Check className="size-3" />
                  </Button>
                  <Button size="icon-s" variant="ghost" disabled={isSavingEdit} onClick={() => setEditingField(null)} className="size-6 text-[#78716C]">
                    <X className="size-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-1">
                  <span className="font-mono text-[#141413] truncate max-w-md">{selectedProvider?.base_url || "—"}</span>
                  <Button size="icon-s" variant="ghost" onClick={() => handleStartEdit("base_url")} className="size-6 text-[#78716C]">
                    <Edit2 className="size-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* 3. API Key */}
            <div className="px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-[#78716C] w-24 shrink-0">API Key</span>
              {editingField === "api_key" ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    type="password"
                    placeholder="输入新密钥"
                    className="h-7 text-[12px] border-[#E2E2DF] flex-1 max-w-sm font-mono"
                    autoFocus
                  />
                  <Button size="icon-s" variant="ghost" disabled={isSavingEdit} onClick={handleSaveEdit} className="size-6 text-[#4B6B4E]">
                    <Check className="size-3" />
                  </Button>
                  <Button size="icon-s" variant="ghost" disabled={isSavingEdit} onClick={() => setEditingField(null)} className="size-6 text-[#78716C]">
                    <X className="size-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-1">
                  <span className="font-mono text-[#78716C]">•••••••••••• (已保存)</span>
                  <Button size="icon-s" variant="ghost" onClick={() => handleStartEdit("api_key")} className="size-6 text-[#78716C]">
                    <Edit2 className="size-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* 挂载模型清单（取消勾选只是关闭，不删除） */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-normal text-[14px] text-[#141413]">
                  供应模型 ({channelModels.length})
                </span>
                <span className="text-[12px] text-[#78716C]">
                  · 上游提供 {selectedChannel.available_models?.length ?? 0} 个模型
                </span>
              </div>
              <Button
                variant="outline"
                size="s"
                onClick={() => onOpenSyncModal(selectedChannel.id, selectedChannel.label || "渠道")}
                className="h-7 gap-1 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
              >
                <RefreshCw className="size-3" />
                <span>同步模型</span>
              </Button>
            </div>
            <p className="text-[12px] text-[#78716C]">
              勾选开启该渠道对此模型的供应
            </p>

            <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white overflow-hidden text-[12px]">
              {channelModels.length === 0 ? (
                <div className="p-6 text-center text-[#78716C]">
                  该渠道尚未配置任何模型。点击上方「同步模型」拉取上游支持的模型。
                </div>
              ) : (
                channelModels.map((m) => {
                  const state = modelStateByRowId[m.id];
                  const presentation = state ? CHANNEL_IDENTITY_PRESENTATION[state.identity] : null;
                  return (
                    <div
                      key={m.id}
                      data-slot="ai-key-model-row"
                      className="h-9 px-3 py-2 flex items-center gap-2 min-w-0"
                    >
                      <Checkbox
                        checked={m.is_enabled}
                        onCheckedChange={(checked) => handleToggleModelSelection(m.model_id, Boolean(checked))}
                        className="size-4 rounded-md shrink-0"
                      />
                      <span className="font-normal text-[13px] text-[#141413] truncate">
                        {m.display_name || m.model_id}
                      </span>
                      {m.display_name && m.display_name !== m.model_id && (
                        <span className="text-[12px] font-mono text-[#78716C] truncate">
                          {m.model_id}
                        </span>
                      )}
                      {presentation && state && (
                        <span className={cn(
                          "ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px]",
                          presentation.badgeClass,
                        )}>
                          <span className={cn("size-1.5 rounded-full", presentation.dot)} />
                          {state.identity === "sleeping"
                            ? `${presentation.label} · ${formatSleepCountdown(state.sleepUntil)}`
                            : presentation.label}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 统一危险操作确认弹窗 */}
      <DangerousActionDialog
        state={impactConfirm}
        onClose={() => setImpactConfirm(null)}
      />
    </div>
  );
}
