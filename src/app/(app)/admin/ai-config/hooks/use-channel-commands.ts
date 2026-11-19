"use client";

import { useCallback, useState } from "react";
import { useAiConfig } from "./use-ai-config";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { readCanonicalModelId } from "@/lib/ai-config/canonical-model";
import type { ImpactConfirmationState } from "../components/dangerous-action-dialog";

type SuccessMessage = string | ((body: Record<string, unknown>) => string);

/**
 * 渠道上的日常操作（暂停/开启供应、测试、调顺位）只有这一份实现：
 * 值班表和渠道维护区都从这里取，确认弹窗状态各用各的。
 */
export function useChannelCommands() {
  const { bundle, runCommand } = useAiConfig();
  const [impactConfirm, setImpactConfirm] = useState<ImpactConfirmationState>(null);
  const [testingKeyModelId, setTestingKeyModelId] = useState<string | null>(null);

  const executeWithConfirm = useCallback(
    async (
      action: string,
      data: Record<string, unknown>,
      entity?: "provider" | "key" | "model" | "feature_binding",
      successMsg?: SuccessMessage,
    ) => {
      const showSuccess = (body: Record<string, unknown>) => {
        if (!successMsg) return;
        feedbackToast.success(typeof successMsg === "function" ? successMsg(body) : successMsg);
      };
      const res = await runCommand(action, data, entity);
      if (res.ok) {
        showSuccess(res.body);
        return res;
      }

      if (res.status === 409 && res.requiresConfirmation) {
        setImpactConfirm({
          type: "impact",
          affectedBusinesses: res.affectedBusinesses || [],
          onConfirm: async () => {
            const retryRes = await runCommand(action, { ...data, confirm_impact: true }, entity);
            if (retryRes.ok) {
              showSuccess(retryRes.body);
            } else {
              feedbackToast.error(retryRes.error || "操作失败");
            }
          },
        });
        return res;
      }

      feedbackToast.error(res.error || "操作失败");
      return res;
    },
    [runCommand],
  );

  // 陷阱 A: 仅开关该供应
  const toggleSupply = useCallback(
    async (keyModelId: string, enabled: boolean) => {
      await executeWithConfirm(
        "update",
        { id: keyModelId, is_enabled: enabled },
        "model",
        enabled ? "已开启该渠道对此模型的供应" : "已暂停该渠道对此模型的供应",
      );
    },
    [executeWithConfirm],
  );

  const swapOrder = useCallback(
    async (modelId: string, keyModelId: string, targetKeyModelId: string) => {
      await executeWithConfirm(
        "swap_model_channel_order",
        { model_id: modelId, key_model_id: keyModelId, target_key_model_id: targetKeyModelId },
        undefined,
        "已调整渠道顺位",
      );
    },
    [executeWithConfirm],
  );

  const testSupply = useCallback(
    async (keyId: string, modelId: string) => {
      const keyModelId = bundle?.models.find(
        (m) => m.key_id === keyId && readCanonicalModelId(m.model_id, m.canonical_model_id) === modelId,
      )?.id;
      if (keyModelId) setTestingKeyModelId(keyModelId);
      try {
        const res = await runCommand("test_key_model", { key_id: keyId, model_id: modelId });
        if (!res.ok) {
          feedbackToast.error(`测试未通过: ${res.error || "服务异常"}`, { duration: 6000 });
          return;
        }
        const testRes = (res.body as Record<string, unknown>).testResult as
          | { ok?: boolean; message?: string; stateWriteError?: string | null }
          | undefined;
        if (testRes?.ok) {
          feedbackToast.success("测试通过，已恢复能用");
        } else {
          feedbackToast.error(`测试未通过: ${testRes?.message || "服务未返回测试结果"}`, { duration: 6000 });
          if (testRes?.stateWriteError) {
            feedbackToast.error(`测试结果未能写入渠道状态：${testRes.stateWriteError}`, { duration: 6000 });
          }
        }
      } finally {
        setTestingKeyModelId(null);
      }
    },
    [bundle, runCommand],
  );

  return {
    executeWithConfirm,
    toggleSupply,
    swapOrder,
    testSupply,
    testingKeyModelId,
    impactConfirm,
    closeImpactConfirm: () => setImpactConfirm(null),
  };
}
