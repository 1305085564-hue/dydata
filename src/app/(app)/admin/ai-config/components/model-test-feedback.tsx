import React from "react";
import type { AiModelTestResult } from "../hooks/use-ai-config";
import { formatLatency } from "@/lib/ai-config/presentation";

export function modelTestKey(keyId: string, modelId: string) {
  return `${keyId}:${modelId}`;
}

export function ModelTestFeedback({ result }: { result?: AiModelTestResult }) {
  if (!result) return null;
  return (
    <span role="status" className={`block w-full text-[12px] break-words whitespace-pre-wrap ${result.ok ? "text-status-success" : "text-status-danger-text"}`}>
      {result.ok
        ? `本次测试通过${result.latencyMs != null ? ` · ${formatLatency(result.latencyMs)}` : ""}`
        : `本次测试未通过：${result.message || "未返回原因"}`}
    </span>
  );
}
