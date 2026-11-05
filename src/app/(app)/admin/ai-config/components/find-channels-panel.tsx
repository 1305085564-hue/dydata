"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AiConfigCommandResult } from "@/lib/ai-config/client-command";

export interface ChannelCandidate {
  keyId: string;
  keyLabel: string;
  providerId: string;
  providerName: string;
  providerEnabled: boolean;
  keyEnabled: boolean;
  existingSupplyId?: string;
  requiresProbe: boolean;
}

export interface FindChannelsPanelProps {
  modelId: string;
  onOpenSupply: (keyId: string, modelId: string) => Promise<AiConfigCommandResult>;
  onClose: () => void;
  runCommand: (action: string, data?: Record<string, unknown>) => Promise<AiConfigCommandResult>;
}

export function FindChannelsPanel({
  modelId,
  onOpenSupply,
  onClose,
  runCommand,
}: FindChannelsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ChannelCandidate[]>([]);
  const [enablingKeyId, setEnablingKeyId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function fetchCandidates() {
      setLoading(true);
      try {
        const res = await runCommand("find_model_channels", { model_id: modelId });
        if (active && res.ok) {
          const list = (res.body as { candidates?: ChannelCandidate[] }).candidates || [];
          setCandidates(list);
        }
      } catch {
        if (active) feedbackToast.error("获取候选渠道失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchCandidates();
    return () => {
      active = false;
    };
  }, [modelId, runCommand]);

  const handleEnable = async (cand: ChannelCandidate) => {
    setEnablingKeyId(cand.keyId);
    setErrorMap((prev) => {
      const next = { ...prev };
      delete next[cand.keyId];
      return next;
    });

    try {
      const res = await onOpenSupply(cand.keyId, modelId);
      if (res.ok) {
        feedbackToast.success(`已连通并打开渠道「${cand.keyLabel || cand.providerName}」`);
        // 从候选列表中移除已成功打开的渠道
        setCandidates((prev) => prev.filter((c) => c.keyId !== cand.keyId));
      } else {
        // 422 现场测试未通过
        const testRes = res.testResult as { message?: string } | undefined;
        const msg = testRes?.message || res.error || "连通性测试未通过";
        setErrorMap((prev) => ({ ...prev, [cand.keyId]: msg }));
      }
    } finally {
      setEnablingKeyId(null);
    }
  };

  return (
    <div className="mx-4 my-2 rounded-xl border border-[#E2E2DF] bg-white p-3 space-y-2">
      <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-normal text-[14px] text-[#141413]">为此模型找渠道</span>
          <span className="text-[12px] text-[#78716C]">
            列出已接入但尚未为该模型打开供应的渠道
          </span>
        </div>
        <Button
          variant="ghost"
          size="s"
          onClick={onClose}
          className="h-7 text-[12px] text-[#78716C]"
        >
          收起
        </Button>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center gap-2 text-[12px] text-[#78716C]">
          <Loader2 className="size-4 animate-spin" />
          <span>正在扫描可用渠道…</span>
        </div>
      ) : candidates.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[#78716C]">
          未发现其他支持该模型的渠道，可通过右上角「接入新渠道」添加。
        </div>
      ) : (
        <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white overflow-hidden">
          {candidates.map((cand) => {
            const isChannelDisabled = !cand.providerEnabled || !cand.keyEnabled;
            const isEnabling = enablingKeyId === cand.keyId;
            const error = errorMap[cand.keyId];

            return (
              <div key={cand.keyId} className="p-3 text-[12px] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-normal text-[#141413] text-[13px]">
                      {cand.keyLabel || cand.providerName}
                    </span>
                    <span className="text-[#78716C]">({cand.providerName})</span>
                    <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#78716C]">
                      未测试
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isChannelDisabled ? (
                      <span className="text-[12px] text-[#8A6A2F]">
                        请先打开这条渠道
                      </span>
                    ) : (
                      <Button
                        size="s"
                        variant="outline"
                        disabled={isEnabling}
                        onClick={() => handleEnable(cand)}
                        className="h-7 text-[12px] border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#F7F7F6]"
                      >
                        {isEnabling ? (
                          <>
                            <Loader2 className="size-3 animate-spin mr-1" />
                            现场测通中…
                          </>
                        ) : (
                          <>
                            <Plus className="size-3 mr-1" />
                            打开供应
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-status-danger/[0.08] border border-status-danger/20 p-2 text-[12px] text-status-danger-text flex items-start gap-2">
                    <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                    <span>现场测试失败：{error}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
