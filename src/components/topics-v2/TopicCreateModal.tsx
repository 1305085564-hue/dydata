"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Check,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
  Info,
  Loader2,
} from "lucide-react";
import type {
  TopicOption,
  BatchImportParsedRow,
  BatchImportSummary,
} from "./types";
import {
  fetchTopicJson,
  isTeamMembershipRequiredError,
  parseCreatedSubTopicResponse,
  parseSuggestedSubTopicsResponse,
} from "@/lib/topics/v2-client-contract";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TopicCreateModalProps {
  isOpen: boolean;
  topics: TopicOption[];
  topicsError?: string | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  canManageTopicLibrary?: boolean;
  onParseFile?: (file: File) => Promise<{
    rows: BatchImportParsedRow[];
    summary: BatchImportSummary;
  }>;
  onConfirmImport?: (rows: BatchImportParsedRow[], fileName?: string | null) => Promise<{
    successCount: number;
    skippedCount: number;
    failedCount: number;
    errors?: Array<{ rowNumber: number; title: string; reason: string }>;
  }>;
}

interface TopicSuggestion {
  id: string;
  title: string;
  hook: string | null;
  topics?: TopicOption | null;
}

export function TopicCreateModal({
  isOpen,
  topics,
  topicsError = null,
  onClose,
  onSuccess,
  canManageTopicLibrary = false,
  onParseFile,
  onConfirmImport,
}: TopicCreateModalProps) {
  // 模式切换：单条录入 vs 批量导入
  const [createMode, setCreateMode] = useState<"single" | "batch">("single");

  // 单条录入状态
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [topicId, setTopicId] = useState("");
  const [emotionTag, setEmotionTag] = useState("");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);

  // 批量导入状态
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload");
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<BatchImportParsedRow[]>([]);
  const [summary, setSummary] = useState<BatchImportSummary | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<"all" | "valid" | "warning" | "error">("all");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [importSubmitError, setImportSubmitError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    successCount: number;
    skippedCount: number;
    failedCount: number;
    errors?: Array<{ rowNumber: number; title: string; reason: string }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetBatchState = () => {
    setImportStep("upload");
    setFileInfo(null);
    setIsDragging(false);
    setParsedRows([]);
    setSummary(null);
    setActiveFilterTab("all");
    setIsParsing(false);
    setParseError(null);
    setIsSubmittingImport(false);
    setImportSubmitError(null);
    setImportResult(null);
  };

  const handleModalClose = () => {
    resetBatchState();
    setTitle("");
    setHook("");
    setTopicId("");
    setEmotionTag("");
    setAudience("");
    setSuggestions([]);
    setErrorMsg(null);
    onClose();
  };

  // 批量导入文件处理
  const handleFile = async (file: File) => {
    if (!file) return;
    setFileInfo({ name: file.name, size: file.size });
    setParseError(null);

    if (!onParseFile) {
      setImportStep("preview");
      setParsedRows([]);
      setSummary(null);
      return;
    }

    try {
      setIsParsing(true);
      const res = await onParseFile(file);
      setParsedRows(res.rows);
      setSummary(res.summary);
      setImportStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "文件解析失败");
      setImportStep("preview");
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmBatchImport = async () => {
    if (!parsedRows.length || isSubmittingImport) return;
    if (!onConfirmImport) {
      setImportSubmitError("导入服务当前不可用，请刷新页面后重试");
      return;
    }

    setIsSubmittingImport(true);
    setImportSubmitError(null);
    try {
      const res = await onConfirmImport(
        parsedRows.filter((r) => r.status !== "error"),
        fileInfo?.name ?? null,
      );
      setImportResult(res);
      setImportStep("result");
      if (res.successCount > 0) {
        await onSuccess();
      }
    } catch (err) {
      setImportSubmitError(err instanceof Error ? err.message : "导入提交失败");
    } finally {
      setIsSubmittingImport(false);
    }
  };

  const filteredBatchRows = parsedRows.filter((row) => {
    if (activeFilterTab === "all") return true;
    return row.status === activeFilterTab;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 智能快贴状态
  const [smartPasteText, setSmartPasteText] = useState("");
  const [isSmartPasteOpen, setIsSmartPasteOpen] = useState(false);
  const [smartPasteSuccessMsg, setSmartPasteSuccessMsg] = useState<string | null>(null);

  const handleApplySmartPaste = () => {
    if (!smartPasteText.trim()) return;
    const raw = smartPasteText.trim();
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

    let extractedTitle = "";
    let extractedHook = "";
    let matchedTopicId = "";

    const titleMatch = raw.match(/(?:【选题(?:名称)?】|标题[：:])\s*([^\n]+)/);
    const hookMatch = raw.match(/(?:【(?:一句话)?钩子|Hook】|钩子[：:]|Hook[：:])\s*([^\n]+)/i);

    if (titleMatch && titleMatch[1]) {
      extractedTitle = titleMatch[1].trim();
    }
    if (hookMatch && hookMatch[1]) {
      extractedHook = hookMatch[1].trim();
    }

    if (!extractedTitle && lines.length > 0) {
      extractedTitle = lines[0].replace(/^[0-9]+[、. ]+/, "").replace(/^[《"“](.*)[》"”]$/, "$1").slice(0, 50);
    }
    if (!extractedHook) {
      if (lines.length > 1) {
        const quoteLine = lines.find((l, idx) => idx > 0 && /[“"『]/.test(l));
        extractedHook = (quoteLine || lines[1]).replace(/^[《"“](.*)[》"”]$/, "$1").slice(0, 100);
      } else {
        extractedHook = extractedTitle;
      }
    }

    if (topics.length > 0) {
      for (const t of topics) {
        if (raw.includes(t.name) || (t.name.length >= 2 && raw.includes(t.name.slice(0, 2)))) {
          matchedTopicId = t.id;
          break;
        }
      }
    }

    if (extractedTitle) setTitle(extractedTitle);
    if (extractedHook) setHook(extractedHook);
    if (matchedTopicId) setTopicId(matchedTopicId);

    setSmartPasteSuccessMsg("已从文案识别填入标题与 Hook");
    setIsSmartPasteOpen(false);
    setTimeout(() => setSmartPasteSuccessMsg(null), 3500);
  };

  // 输入标题或 Hook 后调用真实建议接口，帮助录入者发现已有相似选题。
  useEffect(() => {
    if (!isOpen || (!title.trim() && !hook.trim())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams();
        if (title.trim()) query.set("title", title.trim());
        if (hook.trim()) query.set("content", hook.trim());

        const nextSuggestions = parseSuggestedSubTopicsResponse(
          await fetchTopicJson(
            `/api/topics/sub-topics/suggest?${query.toString()}`,
          ),
        );
        if (isMounted) {
          setSuggestions(nextSuggestions);
          setErrorMsg(null);
        }
      } catch (error) {
        if (!isMounted) return;
        setErrorMsg(
          isTeamMembershipRequiredError(error)
            ? "请先申请加入团队"
            : error instanceof Error
              ? error.message
              : "查重校验失败",
        );
      }
    }, 400);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [hook, isOpen, title]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !hook.trim() || !topicId) {
      setErrorMsg("还有必填项没填：母题、子题标题、一句话 Hook");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const created = parseCreatedSubTopicResponse(
        await fetchTopicJson("/api/topics/sub-topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            hook: hook.trim(),
            topic_id: topicId,
            emotion_tag: emotionTag.trim() || null,
            audience: audience.trim() || null,
          }),
        }),
      );

      if (!created.id) throw new Error("创建接口未返回新选题");
      await onSuccess();
      onClose();
      setTitle("");
      setHook("");
      setTopicId("");
      setEmotionTag("");
      setAudience("");
      setSuggestions([]);
    } catch (error) {
      setErrorMsg(
        isTeamMembershipRequiredError(error)
          ? "请先申请加入团队"
          : error instanceof Error
            ? error.message
            : "请求服务端异常",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading && !isSubmittingImport) handleModalClose();
      }}
    >
      <DialogContent
        className={`flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white/95 p-6 shadow-claude-dialog transition-all duration-150 ${
          createMode === "batch" && importStep === "preview"
            ? "sm:max-w-4xl"
            : "sm:max-w-lg"
        }`}
      >
        <DialogHeader className="mb-0 border-b border-[#E2E2DF] pb-3">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base font-medium text-[#1C1917]">
              录入选题
            </DialogTitle>

            {/* 仅当有管理员权限时提供“单条 / 批量”分段切换；普通成员直接显示单条 */}
            {canManageTopicLibrary && (
              <div className="inline-flex items-center gap-1 bg-[#F1F1F0] p-0.5 rounded-lg text-xs font-medium select-none border border-[#E2E2DF]/60">
                <button
                  type="button"
                  onClick={() => setCreateMode("single")}
                  className={`px-3 py-1 h-6 rounded-md text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                    createMode === "single"
                      ? "bg-white text-[#1C1917] font-semibold shadow-2xs"
                      : "text-[#78716C] hover:text-[#1C1917]"
                  }`}
                >
                  单条录入
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("batch")}
                  className={`px-3 py-1 h-6 rounded-md text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                    createMode === "batch"
                      ? "bg-white text-[#1C1917] font-semibold shadow-2xs"
                      : "text-[#78716C] hover:text-[#1C1917]"
                  }`}
                >
                  <FileSpreadsheet className="size-3 text-[#D97757]" />
                  <span>批量导入</span>
                </button>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* 模式一：单条录入 */}
        {createMode === "single" ? (
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-r-lg border-l-2 border-l-[#C0685C] bg-[#C0685C]/5 p-3 text-[13px] font-normal text-[#292524]">
                  <AlertTriangle className="size-4 shrink-0 text-[#C0685C]" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {topicsError && (
                <div className="rounded-r-lg border-l-2 border-l-[#C0685C] bg-[#C0685C]/5 p-3 text-[13px] font-normal text-[#292524]">
                  母题列表加载失败：{topicsError}
                </div>
              )}

              {/* 智能快贴提取：纸内纯排版，随行在白纸上排版，无装饰大底盒 */}
              <div className="space-y-2 pb-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsSmartPasteOpen(!isSmartPasteOpen)}
                    className="text-xs font-medium text-[#D97757] hover:text-[#C46A4D] flex items-center gap-1.5 cursor-pointer py-1"
                  >
                    <Sparkles className="size-3.5" />
                    <span>{isSmartPasteOpen ? "收起智能提取" : "✨ 从文案/脚本一键智能提取"}</span>
                  </button>
                  {smartPasteSuccessMsg && (
                    <span className="text-[11.5px] text-[#6FAA7D] font-medium animate-in fade-in flex items-center gap-1">
                      <Check className="size-3" />
                      <span>{smartPasteSuccessMsg}</span>
                    </span>
                  )}
                </div>
                {isSmartPasteOpen && (
                  <div className="space-y-2.5 rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-2xs animate-in fade-in duration-150">
                    <p className="text-[12px] text-[#78716C] leading-relaxed">
                      将包含标题、Hook 或文案直接粘贴在下方，系统将自动识别并填写对应输入框：
                    </p>
                    <textarea
                      rows={3}
                      value={smartPasteText}
                      onChange={(e) => setSmartPasteText(e.target.value)}
                      placeholder="例如：
【选题】游资大佬集体发文投降，量化时代散户的生路在哪？
【钩子】“游资大佬集体发文投降，量化时代散户的生路在哪？”"
                      className="w-full resize-none rounded-lg border border-[#E2E2DF] bg-white/50 p-2.5 text-xs text-[#292524] shadow-input placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 font-mono"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSmartPasteText("");
                          setIsSmartPasteOpen(false);
                        }}
                        className="px-2.5 py-1 text-xs text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                      >
                        清空
                      </button>
                      <button
                        type="button"
                        onClick={handleApplySmartPaste}
                        disabled={!smartPasteText.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-[#1C1917] hover:bg-[#292524] text-xs font-medium text-white shadow-xs disabled:opacity-40 cursor-pointer transition-all active:scale-[0.99]"
                      >
                        <span>智能填入表单</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  归属母题 <span className="text-[#C0685C]">*</span>
                </label>
                <Select value={topicId} onValueChange={(val) => setTopicId(val || "")}>
                  <SelectTrigger
                    className="w-full rounded-lg border border-[#E2E2DF] bg-white/50 px-3 py-2 text-[13px] text-[#292524] shadow-input hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                    aria-label="归属母题"
                  >
                    <SelectValue placeholder="选择一个八大母题" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float">
                    {topics.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  子题标题 <span className="text-[#C0685C]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例如：为什么游资打板开始失效？"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-[#E2E2DF] bg-white/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-input placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  aria-label="子题标题"
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  一句话 Hook（开头钩子）<span className="text-[#C0685C]">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="例如：90% 的短线客还在死守龙头战法，却不知道资金早已变盘..."
                  value={hook}
                  onChange={(event) => setHook(event.target.value)}
                  className="w-full rounded-lg border border-[#E2E2DF] bg-white/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-input placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  aria-label="一句话 Hook"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                    情绪标签（可选）
                  </label>
                  <input
                    type="text"
                    placeholder="例如：避坑 / 警醒"
                    value={emotionTag}
                    onChange={(event) => setEmotionTag(event.target.value)}
                    className="w-full rounded-lg border border-[#E2E2DF] bg-white/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-input placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                    aria-label="情绪标签"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                    目标受众（可选）
                  </label>
                  <input
                    type="text"
                    placeholder="例如：进阶交易者"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    className="w-full rounded-lg border border-[#E2E2DF] bg-white/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-input placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                    aria-label="目标受众"
                  />
                </div>
              </div>

              {suggestions.length > 0 && (
                <div className="rounded-xl bg-[#F1F1F0]/70 p-3 text-[13px]">
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-[#292524]">
                    <Lightbulb className="size-4 shrink-0 text-[#B98A54]" />
                    <span>发现相似选题 · 建议差异化切角</span>
                  </div>
                  <p className="text-[11.5px] text-[#78716C] mb-2 leading-relaxed font-normal">
                    若方向重合，建议尝试切换为【避坑避雷】或【反直觉实战案例】等不同角度切入。
                  </p>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto">
                    {suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="rounded-lg bg-white/90 p-2 text-[13px] font-normal shadow-2xs"
                      >
                        <div className="font-medium text-[#292524]">
                          {suggestion.title}
                        </div>
                        <div className="truncate text-[#78716C]">
                          “{suggestion.hook}”
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DialogBody>

            <DialogFooter className="border-t border-[#E2E2DF]/80 bg-transparent px-6 py-3.5 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={handleModalClose}
                disabled={loading}
                aria-label="取消录入"
              >
                取消
              </Button>
              <Button
                type="submit"
                size="m"
                disabled={loading}
                aria-label="保存选题"
              >
                {loading && <RefreshCw className="size-3.5 animate-spin" />}
                <span>{loading ? "录入中..." : "保存选题"}</span>
              </Button>
            </DialogFooter>
          </form>
        ) : (
          /* 模式二：批量导入 */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3 pr-1">
              {importStep === "upload" && (
                <div className="space-y-4 max-w-lg mx-auto py-2">
                  {/* 上传拖拽箱：可聚焦、可键盘（Enter/Space）触发的语义按钮 */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) void handleFile(file);
                    }}
                    className={`group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/40 ${
                      isDragging
                        ? "border-[#D97757]/70 bg-[#D97757]/5"
                        : "border-[#E2E2DF] bg-white/50 hover:border-[#D97757]/60 hover:bg-[#EBEBE9]"
                    }`}
                  >
                    <div className="size-11 rounded-full bg-white border border-[#E2E2DF] flex items-center justify-center text-[#D97757] group-hover:scale-105 shadow-2xs transition-transform mb-2.5">
                      <UploadCloud className="size-5" />
                    </div>
                    <p className="text-[13px] font-semibold text-[#1C1917] mb-0.5">
                      点击选择或将表格文件拖拽至此处
                    </p>
                    <p className="text-xs text-[#78716C] font-normal max-w-xs leading-relaxed">
                      支持 Excel (.xlsx, .xls) 与 CSV 格式，单文件上限 2MB
                    </p>
                  </button>
                  {/* 隐藏文件输入：置于按钮之外作为兄弟节点，由按钮程序化触发，避免 click 冒泡回按钮造成递归 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFile(file);
                    }}
                    className="hidden"
                  />

                  {/* 导入规范说明 */}
                  <div className="rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1C1917] flex items-center gap-1.5">
                        <Info className="size-3.5 text-[#78716C]" />
                        <span>表格字段填写规范</span>
                      </span>
                      <span className="text-[11px] text-[#78716C]">
                        管理员专属通道
                      </span>
                    </div>
                    <ul className="text-[#78716C] space-y-0.5 pl-4 list-disc font-normal leading-relaxed text-[11.5px]">
                      <li><strong>必填项</strong>：选题标题（请勿留空）</li>
                      <li><strong>匹配项</strong>：母题（需与八大母题相匹配）</li>
                      <li><strong>验证项</strong>：历史播放量、点赞数（用于建立选题数据证明）</li>
                    </ul>
                  </div>
                </div>
              )}

              {importStep === "preview" && (
                <div className="space-y-4">
                  {/* 文件信息 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="size-4 text-[#D97757]" />
                      <span className="font-semibold text-[#1C1917]">
                        {fileInfo?.name}
                      </span>
                      <span className="text-[#78716C]">
                        ({fileInfo ? formatFileSize(fileInfo.size) : ""})
                      </span>
                    </div>

                    {summary ? (
                      <div className="flex items-center gap-2.5 font-medium text-[11.5px]">
                        <span className="text-[#292524]">
                          共读取 <strong className="tabular-nums">{summary.totalCount}</strong> 行
                        </span>
                        <span className="text-[#6FAA7D] flex items-center gap-1">
                          <CheckCircle2 className="size-3" />
                          <strong className="tabular-nums">{summary.validCount}</strong> 可导入
                        </span>
                        {summary.warningCount > 0 && (
                          <span className="text-[#B98A54] flex items-center gap-1">
                            <AlertTriangle className="size-3" />
                            <strong className="tabular-nums">{summary.warningCount}</strong> 需确认
                          </span>
                        )}
                        {summary.errorCount > 0 && (
                          <span className="text-[#C0685C] flex items-center gap-1">
                            <XCircle className="size-3" />
                            <strong className="tabular-nums">{summary.errorCount}</strong> 错误项
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {isParsing ? (
                    <div className="py-12 text-center text-xs text-[#78716C]">
                      <Loader2 className="size-5 animate-spin text-[#D97757] mx-auto mb-2" />
                      <span>正在解析文件表格...</span>
                    </div>
                  ) : parseError ? (
                    <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/5 p-4 text-center text-xs space-y-1">
                      <AlertTriangle className="size-5 text-[#C0685C] mx-auto mb-1" />
                      <p className="font-semibold text-[#C0685C]">解析失败</p>
                      <p className="text-[#78716C]">{parseError}</p>
                    </div>
                  ) : summary && parsedRows.length > 0 ? (
                    <>
                      {/* 过滤切换 Tab */}
                      <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-1 bg-[#F1F1F0] p-0.5 rounded-lg text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => setActiveFilterTab("all")}
                            className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                              activeFilterTab === "all"
                                ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                                : "text-[#78716C] hover:text-[#1C1917]"
                            }`}
                          >
                            全部 ({summary.totalCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveFilterTab("valid")}
                            className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                              activeFilterTab === "valid"
                                ? "bg-white text-[#6FAA7D] shadow-2xs font-semibold"
                                : "text-[#78716C] hover:text-[#1C1917]"
                            }`}
                          >
                            可导入 ({summary.validCount})
                          </button>
                          {summary.warningCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setActiveFilterTab("warning")}
                              className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                                activeFilterTab === "warning"
                                  ? "bg-white text-[#B98A54] shadow-2xs font-semibold"
                                  : "text-[#78716C] hover:text-[#1C1917]"
                              }`}
                            >
                              需确认 ({summary.warningCount})
                            </button>
                          )}
                          {summary.errorCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setActiveFilterTab("error")}
                              className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                                activeFilterTab === "error"
                                  ? "bg-white text-[#C0685C] shadow-2xs font-semibold"
                                  : "text-[#78716C] hover:text-[#1C1917]"
                              }`}
                            >
                              错误项 ({summary.errorCount})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 预览表格 */}
                      <div className="overflow-x-auto border border-[#E2E2DF] rounded-xl max-h-60">
                        <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                          <thead className="sticky top-0 bg-[#F1F1F0] border-b border-[#E2E2DF] text-[11px] font-semibold text-[#78716C] select-none">
                            <tr>
                              <th className="py-2 px-2.5 w-12 text-center">行号</th>
                              <th className="py-2 px-2.5 w-24">母题</th>
                              <th className="py-2 px-2.5 min-w-[180px]">选题标题 / Hook</th>
                              <th className="py-2 px-2.5 w-20 text-right">历史播放</th>
                              <th className="py-2 px-2.5 min-w-[140px]">校验结果</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E2DF] bg-white">
                            {filteredBatchRows.map((row) => (
                              <tr
                                key={row.rowNumber}
                                className={`hover:bg-[#F7F7F6] transition-colors ${
                                  row.status === "error"
                                    ? "bg-[#C0685C]/5"
                                    : row.status === "warning"
                                      ? "bg-[#B98A54]/5"
                                      : ""
                                }`}
                              >
                                <td className="py-2 px-2.5 text-center text-[#78716C] tabular-nums font-mono">
                                  {row.rowNumber}
                                </td>
                                <td className="py-2 px-2.5 text-[#292524] font-medium">
                                  {row.topicName || "—"}
                                </td>
                                <td className="py-2 px-2.5 space-y-0.5">
                                  <div className="font-medium text-[#1C1917] line-clamp-1">
                                    {row.title || <span className="text-[#C0685C]">（标题为空）</span>}
                                  </div>
                                  {row.hook && (
                                    <div className="text-[11px] text-[#78716C] line-clamp-1">
                                      “{row.hook}”
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums text-[#292524] font-medium">
                                  {row.historyPlay
                                    ? row.historyPlay >= 10000
                                      ? `${(row.historyPlay / 10000).toFixed(1)}万`
                                      : row.historyPlay.toLocaleString()
                                    : "—"}
                                </td>
                                <td className="py-2 px-2.5">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                      row.status === "valid"
                                        ? "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                                        : row.status === "warning"
                                          ? "bg-[#B98A54]/10 text-[#B98A54]"
                                          : "bg-[#C0685C]/10 text-[#C0685C]"
                                    }`}
                                  >
                                    {row.status === "valid" ? (
                                      <CheckCircle2 className="size-3" />
                                    ) : row.status === "warning" ? (
                                      <AlertTriangle className="size-3" />
                                    ) : (
                                      <XCircle className="size-3" />
                                    )}
                                    <span>{row.validationMessage}</span>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}

                  {importSubmitError && (
                    <div className="rounded-lg bg-[#C0685C]/10 p-3 text-xs text-[#C0685C]">
                      {importSubmitError}
                    </div>
                  )}
                </div>
              )}

              {importStep === "result" && importResult && (
                <div className="space-y-4 max-w-lg mx-auto py-3 text-center">
                  <div className="size-12 rounded-full bg-[#6FAA7D]/10 text-[#6FAA7D] flex items-center justify-center mx-auto mb-1 shadow-2xs">
                    <CheckCircle2 className="size-6 stroke-[2.5]" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-base font-medium text-[#1C1917]">
                      批量导入处理完成
                    </h4>
                    <p className="text-xs text-[#78716C]">
                      已成功同步至干货选题库
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 p-3 text-xs">
                    <div>
                      <div className="text-[#78716C]">成功导入</div>
                      <div className="text-base font-medium text-[#6FAA7D] tabular-nums mt-0.5">
                        {importResult.successCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#78716C]">跳过重复</div>
                      <div className="text-base font-medium text-[#78716C] tabular-nums mt-0.5">
                        {importResult.skippedCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#78716C]">失败数量</div>
                      <div className="text-base font-medium text-[#C0685C] tabular-nums mt-0.5">
                        {importResult.failedCount}
                      </div>
                    </div>
                  </div>

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 p-3 text-left text-xs space-y-1">
                      <div className="font-medium text-[#C0685C] flex items-center gap-1.5 text-xs">
                        <span className="size-1.5 rounded-full bg-[#C0685C]" />
                        <span>失败明细</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto pr-1 text-[#292524]">
                        {importResult.errors.map((err, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <span className="tabular-nums font-medium text-[#78716C]">第 {err.rowNumber} 行:</span>
                            <span>{err.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DialogBody>

            <DialogFooter className="border-t border-[#E2E2DF]/80 bg-transparent px-6 py-3.5 flex items-center justify-between gap-2.5">
              {importStep === "upload" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="m"
                    onClick={handleModalClose}
                  >
                    取消
                  </Button>
                  <div />
                </>
              ) : importStep === "preview" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="m"
                    onClick={() => setImportStep("upload")}
                    className="flex items-center gap-1"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>重选文件</span>
                  </Button>
                  <Button
                    type="button"
                    size="m"
                    disabled={isSubmittingImport || !parsedRows.length || !onConfirmImport}
                    onClick={handleConfirmBatchImport}
                    className="flex items-center gap-1"
                  >
                    <span>
                      {isSubmittingImport
                        ? "正在导入..."
                        : onConfirmImport && parsedRows.length > 0
                          ? `确认导入 ${parsedRows.filter((r) => r.status !== "error").length} 条选题`
                          : "无法导入"}
                    </span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="m"
                    onClick={() => setImportStep("upload")}
                  >
                    继续导入
                  </Button>
                  <Button
                    type="button"
                    size="m"
                    onClick={handleModalClose}
                  >
                    完成退出
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
