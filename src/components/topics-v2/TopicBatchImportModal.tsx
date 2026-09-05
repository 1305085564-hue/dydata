"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  ArrowRight,
  Info,
  Loader2,
} from "lucide-react";
import type {
  BatchImportParsedRow,
  BatchImportSummary,
} from "./types";

export interface TopicBatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
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

type ImportStep = "upload" | "preview" | "result";
type PreviewFilterTab = "all" | "valid" | "warning" | "error";

export function TopicBatchImportModal({
  isOpen,
  onClose,
  onParseFile,
  onConfirmImport,
}: TopicBatchImportModalProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<BatchImportParsedRow[]>([]);
  const [summary, setSummary] = useState<BatchImportSummary | null>(null);
  const [activeFilterTab, setActiveFilterTab] =
    useState<PreviewFilterTab>("all");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    successCount: number;
    skippedCount: number;
    failedCount: number;
    errors?: Array<{ rowNumber: number; title: string; reason: string }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClose = React.useCallback(() => {
    setStep("upload");
    setFileInfo(null);
    setIsDragging(false);
    setParsedRows([]);
    setSummary(null);
    setActiveFilterTab("all");
    setIsParsing(false);
    setParseError(null);
    setIsSubmitting(false);
    setSubmitError(null);
    setImportResult(null);
    onClose();
  }, [onClose]);

  // Esc 监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, handleClose]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file) return;

    setFileInfo({ name: file.name, size: file.size });
    setParseError(null);

    if (!onParseFile) {
      // 没有真实解析回调时不伪造预览数据，明确提示当前不可用。
      setStep("preview");
      setParsedRows([]);
      setSummary(null);
      return;
    }

    try {
      setIsParsing(true);
      const res = await onParseFile(file);
      setParsedRows(res.rows);
      setSummary(res.summary);
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "文件解析失败");
      setStep("preview");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleConfirm = async () => {
    if (!parsedRows.length || isSubmitting) return;

    if (!onConfirmImport) {
      setSubmitError("导入服务当前不可用，请刷新页面后重试");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await onConfirmImport(
        parsedRows.filter((r) => r.status !== "error"),
        fileInfo?.name ?? null,
      );
      setImportResult(res);
      setStep("result");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "导入提交失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRows = parsedRows.filter((row) => {
    if (activeFilterTab === "all") return true;
    return row.status === activeFilterTab;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-[80] bg-[#1C1917]/25 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={() => !isSubmitting && handleClose()}
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-full max-w-4xl max-h-[min(90dvh,calc(100dvh-2rem))] flex flex-col rounded-2xl border border-[#E5E0D6] bg-white shadow-claude-dialog overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[#ECE7DE]/60 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-[#F5F3EE] border border-[#ECE7DE]/60 flex items-center justify-center text-[#D97757] shadow-2xs">
              <FileSpreadsheet className="size-4" />
            </div>
            <div>
              <h3
                id="import-modal-title"
                className="text-base font-semibold text-[#1C1917]"
              >
                批量导入外部干货选题
              </h3>
              <p className="text-xs text-[#78716C]">
                管理员通道 · 支持 Excel (.xlsx, .xls) 与 CSV 格式
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !isSubmitting && handleClose()}
            className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 主体切换 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {step === "upload" && (
            <div className="space-y-6 max-w-xl mx-auto py-4">
              {/* 上传拖拽箱 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer ${
                  isDragging
                    ? "border-[#D97757]/70 bg-[#D97757]/5"
                    : "border-[#E5E0D6] bg-white/50 hover:border-[#D97757]/60 hover:bg-[#F5F3EE]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="size-12 rounded-full bg-white border border-[#ECE7DE] flex items-center justify-center text-[#D97757] group-hover:scale-105 shadow-2xs transition-transform mb-3">
                  <UploadCloud className="size-6" />
                </div>
                <p className="text-sm font-semibold text-[#1C1917] mb-1">
                  点击选择或将文件拖拽至此处
                </p>
                <p className="text-xs text-[#78716C] font-normal max-w-xs leading-relaxed">
                  支持 .xlsx、.xls、.csv 格式，单文件上限 2MB
                </p>
              </div>

              {/* 导入规范说明 */}
              <div className="rounded-xl border border-[#ECE7DE]/60 bg-[#F5F3EE]/60 p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <Info className="size-3.5 text-[#78716C]" />
                    <span>表格字段填写规范</span>
                  </span>
                  <span className="text-[11.5px] text-[#78716C]">
                    导入模板由管理员配置
                  </span>
                </div>
                <ul className="text-[#78716C] space-y-1 pl-4 list-disc font-normal leading-relaxed">
                  <li><strong>必填项</strong>：选题标题（请勿留空）</li>
                  <li><strong>匹配项</strong>：母题（若与八大母题不符，将提示待确认）</li>
                  <li><strong>验证项</strong>：历史播放量、历史点赞数（用于建立选题历史成绩证明）</li>
                  <li><strong>补充项</strong>：一句话 Hook、内容提纲、预估时长</li>
                </ul>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* 文件信息 */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECE7DE]/60 bg-[#F5F3EE]/60 p-3.5 text-xs">
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
                  <div className="flex items-center gap-3 font-medium">
                    <span className="text-[#292524]">
                      共读取 <strong className="tabular-nums">{summary.totalCount}</strong> 行
                    </span>
                    <span className="text-[#6FAA7D] flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      <strong className="tabular-nums">{summary.validCount}</strong> 可导入
                    </span>
                    {summary.warningCount > 0 && (
                      <span className="text-[#B98A54] flex items-center gap-1">
                        <AlertTriangle className="size-3.5" />
                        <strong className="tabular-nums">{summary.warningCount}</strong> 需确认
                      </span>
                    )}
                    {summary.errorCount > 0 && (
                      <span className="text-[#C0685C] flex items-center gap-1">
                        <XCircle className="size-3.5" />
                        <strong className="tabular-nums">{summary.errorCount}</strong> 错误项
                      </span>
                    )}
                  </div>
                ) : null}
              </div>

              {isParsing ? (
                <div className="py-16 text-center text-xs text-[#78716C]">
                  <Loader2 className="size-5 animate-spin text-[#D97757] mx-auto mb-2" />
                  <span>正在解析文件表格...</span>
                </div>
              ) : parseError ? (
                <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/5 p-4 text-center text-xs space-y-1">
                  <AlertTriangle className="size-5 text-[#C0685C] mx-auto mb-1" />
                  <p className="font-semibold text-[#C0685C]">解析失败</p>
                  <p className="text-[#78716C]">{parseError}</p>
                </div>
              ) : !onParseFile ? (
                /* 没有真实解析回调时的明确提示 */
                <div className="rounded-2xl border border-dashed border-[#E5E0D6] bg-[#F5F3EE]/40 p-8 text-center text-xs space-y-2">
                  <Info className="size-6 text-[#78716C] mx-auto text-[#D97757]" />
                  <p className="font-semibold text-[#1C1917]">
                    当前无法解析文件
                  </p>
                  <p className="text-[#78716C] max-w-md mx-auto leading-relaxed">
                    已选择文件《{fileInfo?.name}》，但当前没有可用的解析服务，请刷新页面后重试。
                  </p>
                </div>
              ) : summary && parsedRows.length > 0 ? (
                <>
                  {/* 过滤切换 Tab */}
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1 bg-[#F5F3EE] p-0.5 rounded-lg text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setActiveFilterTab("all")}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
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
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
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
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
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
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
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
                  <div className="overflow-x-auto border border-[#ECE7DE] rounded-xl max-h-72">
                    <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                      <thead className="sticky top-0 bg-[#F5F3EE] border-b border-[#ECE7DE] text-[11px] font-semibold text-[#78716C] select-none">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">行号</th>
                          <th className="py-2.5 px-3 w-24">母题</th>
                          <th className="py-2.5 px-3 min-w-[200px]">选题标题 / Hook</th>
                          <th className="py-2.5 px-3 w-20 text-right">历史播放</th>
                          <th className="py-2.5 px-3 w-20">时长</th>
                          <th className="py-2.5 px-3 min-w-[150px]">校验结果</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECE7DE] bg-white">
                        {filteredRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={`hover:bg-[#FBF9F5]/70 transition-colors ${
                              row.status === "error"
                                ? "bg-[#C0685C]/5"
                                : row.status === "warning"
                                  ? "bg-[#B98A54]/5"
                                  : ""
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center text-[#78716C] tabular-nums font-mono">
                              {row.rowNumber}
                            </td>
                            <td className="py-2.5 px-3 text-[#292524] font-medium">
                              {row.topicName || "—"}
                            </td>
                            <td className="py-2.5 px-3 space-y-0.5">
                              <div className="font-medium text-[#1C1917] line-clamp-1">
                                {row.title || <span className="text-[#C0685C]">（标题为空）</span>}
                              </div>
                              {row.hook && (
                                <div className="text-[11px] text-[#78716C] line-clamp-1">
                                  “{row.hook}”
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-[#292524] font-medium">
                              {row.historyPlay
                                ? row.historyPlay >= 10000
                                  ? `${(row.historyPlay / 10000).toFixed(1)}万`
                                  : row.historyPlay.toLocaleString()
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-[#78716C] text-[11.5px]">
                              {row.durationText || "—"}
                            </td>
                            <td className="py-2.5 px-3">
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

              {submitError && (
                <div className="rounded-lg bg-[#C0685C]/10 p-3 text-xs text-[#C0685C]">
                  {submitError}
                </div>
              )}
            </div>
          )}

          {step === "result" && importResult && (
            <div className="space-y-6 max-w-lg mx-auto py-4 text-center">
              <div className="size-14 rounded-full bg-[#6FAA7D]/10 text-[#6FAA7D] flex items-center justify-center mx-auto mb-2 shadow-2xs">
                <CheckCircle2 className="size-7 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-medium text-[#1C1917]">
                  导入处理完成
                </h4>
                <p className="text-xs text-[#78716C] leading-relaxed">
                  导入结果已同步至数据库
                </p>
              </div>

              {/* 结果汇总三联 */}
              <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#ECE7DE]/60 bg-[#F5F3EE]/60 p-4 text-xs">
                <div>
                  <div className="text-[#78716C]">成功导入</div>
                  <div className="text-lg font-medium text-[#6FAA7D] tabular-nums mt-0.5">
                    {importResult.successCount}
                  </div>
                </div>
                <div>
                  <div className="text-[#78716C]">跳过重复</div>
                  <div className="text-lg font-medium text-[#78716C] tabular-nums mt-0.5">
                    {importResult.skippedCount}
                  </div>
                </div>
                <div>
                  <div className="text-[#78716C]">失败数量</div>
                  <div className="text-lg font-medium text-[#C0685C] tabular-nums mt-0.5">
                    {importResult.failedCount}
                  </div>
                </div>
              </div>

              {/* 失败明细列表 */}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="rounded-xl border border-[#ECE7DE]/60 bg-[#F5F3EE]/60 p-3 text-left text-xs space-y-1.5">
                  <div className="font-medium text-[#C0685C] flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#C0685C]" />
                    <span>失败明细</span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1 text-[#292524]">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11.5px]">
                        <span className="tabular-nums font-medium text-[#78716C]">第 {err.rowNumber} 行:</span>
                        <span>{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底栏 */}
        <div className="flex items-center justify-between border-t border-[#ECE7DE]/60 bg-white px-6 py-4 shrink-0">
          {step === "upload" ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="h-7 rounded-md px-3 text-xs font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
              >
                取消
              </button>
              <div />
            </>
          ) : step === "preview" ? (
            <>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
                <span>重新选择文件</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting || !parsedRows.length || !onConfirmImport}
                onClick={handleConfirm}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#D97757] px-4 text-xs font-medium text-white hover:bg-[#C46A4D] active:scale-[0.99] active:duration-120 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <span>
                  {isSubmitting
                    ? "正在导入..."
                    : onConfirmImport && parsedRows.length > 0
                      ? `确认导入 ${parsedRows.filter((r) => r.status !== "error").length} 条选题`
                      : "当前无法导入"}
                </span>
                <ArrowRight className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="h-7 rounded-md px-3 text-xs font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
              >
                继续导入其他文件
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="h-7 rounded-md bg-[#F5F3EE] px-4 text-xs font-medium text-[#292524] hover:bg-[#ECE7DE] hover:text-[#1C1917] active:scale-[0.99] active:duration-120 transition-all shadow-2xs cursor-pointer"
              >
                完成退出
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
