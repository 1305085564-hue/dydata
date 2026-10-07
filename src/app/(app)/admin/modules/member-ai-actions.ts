"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AiSuggestionItem, MemberAiSuggestionState, ToolConfirmationState } from "./member-ai-dialogs";

export function useMemberAiActions(activeMemberId: string | null) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<MemberAiSuggestionState | null>(null);
  const [executingAiKey, setExecutingAiKey] = useState<string | null>(null);
  const [toolConfirmationModal, setToolConfirmationModal] = useState<ToolConfirmationState | null>(null);

  const resetAiState = useCallback(() => {
    setAiSuggestion(null);
    setIsAiDialogOpen(false);
    setToolConfirmationModal(null);
  }, []);

  useEffect(() => {
    resetAiState();
  }, [activeMemberId, resetAiState]);

  const handleFetchAiSuggestion = useCallback(async () => {
    if (!activeMemberId) return;
    setAiSuggestion({ status: "normal", summary: "", suggestions: [], loading: true, error: null });
    try {
      const res = await fetch("/api/admin/member-ai-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: activeMemberId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAiSuggestion({
          status: "critical",
          summary: "",
          suggestions: [],
          loading: false,
          error: err.error || "获取建议失败",
        });
        return;
      }
      const payload = await res.json();
      setAiSuggestion({
        status: payload.status || "normal",
        summary: payload.summary || "发布与权限状态良好。",
        suggestions: payload.suggestions || [],
        loading: false,
        error: null,
      });
    } catch {
      setAiSuggestion({
        status: "critical",
        summary: "",
        suggestions: [],
        loading: false,
        error: "网络异常，无法获取 AI 诊断",
      });
    }
  }, [activeMemberId]);

  const handleExecuteAiSuggestion = useCallback(async (
    suggestion: AiSuggestionItem,
    key: string,
    confirmationToken?: string,
  ) => {
    if (executingAiKey && !confirmationToken) return;
    if (suggestion.action.type === "navigate" && suggestion.action.href) {
      router.push(suggestion.action.href);
      return;
    }
    if (suggestion.action.type !== "execute_tool") return;

    const action = suggestion.action;
    setExecutingAiKey(key);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/execute-tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolName: action.toolName,
            toolArgs: action.toolArgs ?? {},
            confirmationToken,
          }),
        });
        if (res.status === 409) {
          const payload = await res.json();
          setToolConfirmationModal({
            toolName: action.toolName,
            toolArgs: action.toolArgs ?? {},
            confirmationToken: payload.confirmationToken,
            preview: payload.result?.preview ?? null,
          });
          return;
        }

        const payload = await res.json();
        if (!res.ok || !payload.success) {
          feedbackToast.error("执行失败", { description: payload.error || "工具执行出错" });
        } else {
          feedbackToast.success("工具执行成功");
          setToolConfirmationModal(null);
          void handleFetchAiSuggestion();
          router.refresh();
        }
      } catch {
        feedbackToast.error("执行超时或网络异常");
      } finally {
        setExecutingAiKey(null);
      }
    });
  }, [executingAiKey, handleFetchAiSuggestion, router]);

  return {
    isPending,
    isAiDialogOpen,
    setIsAiDialogOpen,
    aiSuggestion,
    executingAiKey,
    toolConfirmationModal,
    setToolConfirmationModal,
    handleFetchAiSuggestion,
    handleExecuteAiSuggestion,
    resetAiState,
  };
}
