import { Sparkles, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatAiToolPreview, getAiToolDisplayName, type MemberAiProfile } from "./member-ai-preview";

export type AiSuggestionItem = {
  label: string;
  description: string;
  action:
    | { type: "execute_tool"; toolName: string; toolArgs?: Record<string, unknown> }
    | { type: "navigate"; href: string };
};

export type MemberAiSuggestionState = {
  status: "normal" | "warning" | "critical";
  summary: string;
  suggestions: AiSuggestionItem[];
  loading: boolean;
  error?: string | null;
};

export type ToolConfirmationState = {
  toolName: string;
  toolArgs: Record<string, unknown>;
  confirmationToken: string;
  preview?: Record<string, unknown> | null;
};

type MemberAiDialogsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestion: MemberAiSuggestionState | null;
  executingKey: string | null;
  pending: boolean;
  confirmation: ToolConfirmationState | null;
  profiles: MemberAiProfile[];
  onRefresh: () => void;
  onNavigate: (href: string) => void;
  onExecute: (suggestion: AiSuggestionItem, key: string) => void;
  onCancelConfirmation: () => void;
  onConfirm: () => void;
};

export function MemberAiDialogs({
  open, onOpenChange, suggestion, executingKey, pending, confirmation, profiles,
  onRefresh, onNavigate, onExecute, onCancelConfirmation, onConfirm,
}: MemberAiDialogsProps) {
  const toolDisplayName = getAiToolDisplayName(confirmation?.toolName ?? "");
  const toolPreviewLines = formatAiToolPreview(confirmation?.toolName ?? "", confirmation?.preview, profiles);

  return (
    <>
      {/* AI 诊断弹窗 */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden max-w-[480px] p-6 rounded-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-[#D97757]" />
                <DialogTitle className="text-base font-medium text-[#1C1917]">AI 成员管理诊断</DialogTitle>
              </div>
              <Button
                variant="ghost"
                size="xs"
                disabled={suggestion?.loading}
                onClick={onRefresh}
                className="text-[12px] text-[#D97757] hover:bg-[#D97757]/10 hover:text-[#C96442] gap-1"
              >
                <RefreshCw className={cn("size-3", suggestion?.loading && "animate-spin")} />
                刷新分析
              </Button>
            </div>
            <DialogDescription className="text-[13px] text-[#292524]">
              综合分析近期日报周期、异常断流及个人表现
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
            {suggestion?.loading && (
              <div className="py-8 text-center text-[13px] text-[#292524] space-y-2 bg-[#FCFCFB] rounded-xl">
                <RefreshCw className="size-5 text-[#D97757] animate-spin mx-auto" />
                <p>正在结合近期日报、播放量与异常数据生成诊断...</p>
              </div>
            )}

            {suggestion?.error && (
              <div className="p-3 bg-[#C0685C]/10 text-[#C0685C] rounded-xl text-[13px] flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{suggestion.error}</span>
              </div>
            )}

            {suggestion?.suggestions && !suggestion.loading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-[#FCFCFB] rounded-xl">
                  <Badge
                    variant={
                      suggestion.status === "critical"
                        ? "destructive"
                        : suggestion.status === "warning"
                        ? "warning"
                        : "success"
                    }
                  >
                    {suggestion.status === "critical"
                      ? "需重点跟进"
                      : suggestion.status === "warning"
                      ? "建议关注"
                      : "状态正常"}
                  </Badge>
                  <p className="font-serif text-sm font-normal text-[#292524] text-pretty leading-relaxed">{suggestion.summary}</p>
                </div>

                {suggestion.suggestions.length > 0 && (
                  <div className="divide-y divide-[#E2E2DF] rounded-xl border border-[#E2E2DF] bg-white p-2">
                    {suggestion.suggestions.map((s, idx) => {
                      const key = `${s.label}-${idx}`;
                      const isBusy = executingKey === key;
                      return (
                        <div key={idx} className="py-2.5 px-2 flex items-start justify-between gap-2">
                          <div className="text-[13px] space-y-0.5">
                            <p className="font-medium text-[#1C1917]">{s.label}</p>
                            <p className="text-[#78716C] text-[12px]">{s.description}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            {s.action.type === "navigate" && (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  if ("href" in s.action) onNavigate(s.action.href);
                                }}
                                className="text-[#D97757] text-[12px]"
                              >
                                前往 <ArrowRight className="size-3 ml-0.5" />
                              </Button>
                            )}
                            {s.action.type === "execute_tool" && (
                              <Button
                                variant="default"
                                size="xs"
                                disabled={isBusy}
                                onClick={() => onExecute(s, key)}
                                className="bg-[#D97757] hover:bg-[#C96442] text-[12px]"
                              >
                                {isBusy ? "执行中..." : "一键执行"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* AI 工具执行二次确认弹窗 (2.2 支持 execute_tool 409 二次确认) */}
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(nextOpen) => !nextOpen && onCancelConfirmation()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#1C1917] flex items-center gap-2">
              <AlertCircle className="size-5 text-[#D97757]" />
              确认执行 AI 管理建议动作
            </DialogTitle>
            <DialogDescription>
              该操作属于敏感管理动作（{toolDisplayName}），请确认预估变更后继续。
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="min-h-0 flex-1 overflow-y-auto py-2">
            {!confirmation?.preview ? (
              <p className="text-[13px] text-[#292524]">暂无预估变更，确认即执行</p>
            ) : toolPreviewLines.length > 0 ? (
              <ul className="bg-[#FCFCFB] p-3 rounded-xl border border-[#E2E2DF]/60 text-[13px] space-y-1.5 text-[#292524]">
                {toolPreviewLines.map((line) => <li key={line}>• {line}</li>)}
              </ul>
            ) : (
              <div className="bg-[#FCFCFB] p-3 rounded-xl border border-[#E2E2DF]/60 text-[13px] space-y-2 text-[#292524]">
                <p>AI 建议执行「{toolDisplayName}」，确认后才会生效</p>
                <details className="text-[12px] text-[#78716C]">
                  <summary className="cursor-pointer">查看原始预估数据</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all font-mono">
                    {JSON.stringify(confirmation.preview, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => onCancelConfirmation()}>
              取消
            </Button>
            <Button
              variant="default"
              disabled={pending}
              onClick={onConfirm}
              className="bg-[#D97757] hover:bg-[#C96442]"
            >
              {pending ? "执行中..." : "确认执行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
