"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SummaryData } from "./types";

interface UnattributedReport {
  reportId: string;
  reportDate: string;
  accountId: string;
  accountName: string;
  title: string;
  playCount: number;
  creatorUserId: string;
  creatorName: string;
  scriptAuthorUserId: string | null;
  scriptAuthorName: string | null;
  videoEditorUserId: string | null;
  videoEditorName: string | null;
  operatorUserId: string | null;
  operatorName: string | null;
}

interface CandidateMember {
  id: string;
  name: string;
}

interface HealthBarProps {
  summary: SummaryData | null;
  year?: number;
  month?: number;
  canEdit?: boolean;
  onAttributionUpdated?: () => void;
}

export function calculateAttributionCompleteness(summary: Pick<SummaryData, "total" | "unattributed">) {
  if (summary.total <= 0) return 100;
  return Math.floor(((summary.total - summary.unattributed) / summary.total) * 100);
}

export function HealthBar({
  summary,
  year,
  month,
  canEdit = false,
  onAttributionUpdated,
}: HealthBarProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reports, setReports] = useState<UnattributedReport[]>([]);
  const [members, setMembers] = useState<CandidateMember[]>([]);
  const [savingReportId, setSavingReportId] = useState<string | null>(null);

  const fetchUnattributedList = useCallback(async () => {
    if (!year || !month) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/collaboration/unattributed?year=${year}&month=${month}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.reports)) {
        setReports(data.reports);
        setMembers(data.candidateMembers || []);
      } else {
        feedbackToast.error("加载待补列表失败", { description: data.error });
      }
    } catch {
      feedbackToast.error("网络异常，无法加载待补归属");
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  const handleOpen = () => {
    setIsOpen(true);
    void fetchUnattributedList();
  };

  const handleAssignRole = async (
    report: UnattributedReport,
    role: "scriptAuthor" | "videoEditor" | "operator",
    targetUserId: string,
  ) => {
    setSavingReportId(report.reportId);
    const payload = {
      reportId: report.reportId,
      scriptAuthorUserId: role === "scriptAuthor" ? targetUserId : report.scriptAuthorUserId,
      videoEditorUserId: role === "videoEditor" ? targetUserId : report.videoEditorUserId,
      operatorUserId: role === "operator" ? targetUserId : report.operatorUserId,
    };

    try {
      const res = await fetch("/api/admin/collaboration/attribution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        // 更新本地行 (就地可见更新，省略成功 Toast)
        const targetMemberName = members.find((m) => m.id === targetUserId)?.name ?? "已指定";
        setReports((prev) =>
          prev
            .map((r) => {
              if (r.reportId !== report.reportId) return r;
              return {
                ...r,
                scriptAuthorUserId: payload.scriptAuthorUserId,
                scriptAuthorName: role === "scriptAuthor" ? targetMemberName : r.scriptAuthorName,
                videoEditorUserId: payload.videoEditorUserId,
                videoEditorName: role === "videoEditor" ? targetMemberName : r.videoEditorName,
                operatorUserId: payload.operatorUserId,
                operatorName: role === "operator" ? targetMemberName : r.operatorName,
              };
            })
            .filter((r) => !r.scriptAuthorUserId || !r.videoEditorUserId || !r.operatorUserId),
        );
        router.refresh();
        onAttributionUpdated?.();
      } else {
        feedbackToast.error("更新归属失败", { description: data.error || "服务端拒绝" });
      }
    } catch {
      feedbackToast.error("网络异常，保存失败");
    } finally {
      setSavingReportId(null);
    }
  };

  if (!summary) return null;

  const isHealthy = summary.unattributed === 0;
  const healthRate = calculateAttributionCompleteness(summary);

  return (
    <>
      {/* 控制舱右侧：静默芯片 (Pill Chip) */}
      <button
        type="button"
        onClick={handleOpen}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all cursor-pointer ${
          isHealthy
            ? "bg-[#F1F1F0] text-[#57534E] hover:bg-[#EBEBE9]/70"
            : "bg-[#B98A54]/10 text-[#8A6A2F] hover:bg-[#B98A54]/15"
        }`}
      >
        {isHealthy ? (
          <CheckCircle2 className="size-3.5 text-[#6FAA7D] shrink-0 opacity-80" />
        ) : (
          <AlertCircle className="size-3.5 text-[#B98A54] shrink-0 opacity-90" />
        )}
        <span>
          {isHealthy
            ? "岗位归属完整"
            : `岗位完整度 ${healthRate}%（${summary.unattributed} 条待补）`}
        </span>
      </button>

      {/* 待补归属速补抽屉 */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent showCloseButton={false} className="w-full max-w-lg sm:max-w-lg p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#E2E2DF] flex items-center justify-between shrink-0 bg-[#FCFCFB]/40">
            <div className="flex items-center gap-2">
              {isHealthy ? (
                <CheckCircle2 className="size-4 text-[#6FAA7D]" />
              ) : (
                <AlertCircle className="size-4 text-[#B98A54]" />
              )}
              <div>
                <SheetTitle className="text-base font-medium text-[#1C1917]">
                  {isHealthy
                    ? "岗位归属完整"
                    : `待补岗位归属 (${isLoading ? summary.unattributed : reports.length})`}
                </SheetTitle>
                <SheetDescription className="text-[12px] text-[#78716C] mt-0.5">
                  {year} 年 {month} 月作品归属明细 · 共 {summary.total} 条作品
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="size-7 rounded-lg flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-[#78716C] gap-2">
                <Loader2 className="size-5 animate-spin text-[#D97757]" />
                <span className="text-[12.5px]">正在扫描待补归属作品…</span>
              </div>
            ) : isHealthy || reports.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <div className="size-10 rounded-full bg-[#6FAA7D]/10 text-[#6FAA7D] flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="size-5" />
                </div>
                <p className="text-[13.5px] font-medium text-[#1C1917]">本月作品岗位归属均已完备</p>
                <p className="text-[12px] text-[#78716C]">
                  所有作品均已关联明确的文案、剪辑与运营责任人。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#F1F1F0]/60 border border-[#E2E2DF] text-[12px] text-[#78716C] leading-relaxed">
                  以下作品未录齐文案、剪辑或运营责任人。{canEdit ? "可在下方直接指派责任人，系统将实时核算各岗位月报。" : "如需指派责任人，请联系管理员处理。"}
                </div>

                <div className="divide-y divide-[#E2E2DF]/70 border border-[#E2E2DF] rounded-xl overflow-hidden bg-white">
                  {reports.map((report) => {
                    const isSaving = savingReportId === report.reportId;
                    return (
                      <div key={report.reportId} className="p-3.5 space-y-2.5 hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[12px] text-[#78716C] mb-0.5">
                              <span className="tabular-nums">{report.reportDate}</span>
                              <span>·</span>
                              <span className="font-medium text-[#292524]">{report.accountName}</span>
                              <span>·</span>
                              <span>创建人：{report.creatorName}</span>
                            </div>
                            <h5 className="text-[13px] font-medium text-[#1C1917] line-clamp-1" title={report.title}>
                              {report.title}
                            </h5>
                          </div>
                          {isSaving && (
                            <Loader2 className="size-3.5 animate-spin text-[#D97757] shrink-0 mt-1" />
                          )}
                        </div>

                        {/* 三岗位补录排 */}
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#E2E2DF]/50">
                          {/* 文案 */}
                          <div className="space-y-1">
                            <span className="text-[11px] text-[#78716C] block">文案</span>
                            {report.scriptAuthorName ? (
                              <span className="inline-block text-[12px] font-medium text-[#292524] bg-[#F1F1F0] px-2 py-0.5 rounded truncate max-w-full">
                                {report.scriptAuthorName}
                              </span>
                            ) : canEdit ? (
                              <Select
                                onValueChange={(val) => {
                                  if (typeof val === "string") {
                                    void handleAssignRole(report, "scriptAuthor", val);
                                  }
                                }}
                                disabled={isSaving}
                              >
                                <SelectTrigger className="h-7 text-[12px] px-2.5 bg-white border-[#E2E2DF] text-[#C0685C] font-medium rounded-md">
                                  <SelectValue placeholder="补录文案…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {members.map((m) => (
                                    <SelectItem key={m.id} value={m.id} className="text-[12px]">
                                      {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[11.5px] text-[#C0685C]">未指派</span>
                            )}
                          </div>

                          {/* 剪辑 */}
                          <div className="space-y-1">
                            <span className="text-[11px] text-[#78716C] block">剪辑</span>
                            {report.videoEditorName ? (
                              <span className="inline-block text-[12px] font-medium text-[#292524] bg-[#F1F1F0] px-2 py-0.5 rounded truncate max-w-full">
                                {report.videoEditorName}
                              </span>
                            ) : canEdit ? (
                              <Select
                                onValueChange={(val) => {
                                  if (typeof val === "string") {
                                    void handleAssignRole(report, "videoEditor", val);
                                  }
                                }}
                                disabled={isSaving}
                              >
                                <SelectTrigger className="h-7 text-[12px] px-2.5 bg-white border-[#E2E2DF] text-[#C0685C] font-medium rounded-md">
                                  <SelectValue placeholder="补录剪辑…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {members.map((m) => (
                                    <SelectItem key={m.id} value={m.id} className="text-[12px]">
                                      {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[11.5px] text-[#C0685C]">未指派</span>
                            )}
                          </div>

                          {/* 运营 */}
                          <div className="space-y-1">
                            <span className="text-[11px] text-[#78716C] block">运营</span>
                            {report.operatorName ? (
                              <span className="inline-block text-[12px] font-medium text-[#292524] bg-[#F1F1F0] px-2 py-0.5 rounded truncate max-w-full">
                                {report.operatorName}
                              </span>
                            ) : canEdit ? (
                              <Select
                                onValueChange={(val) => {
                                  if (typeof val === "string") {
                                    void handleAssignRole(report, "operator", val);
                                  }
                                }}
                                disabled={isSaving}
                              >
                                <SelectTrigger className="h-7 text-[12px] px-2.5 bg-white border-[#E2E2DF] text-[#C0685C] font-medium rounded-md">
                                  <SelectValue placeholder="补录运营…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {members.map((m) => (
                                    <SelectItem key={m.id} value={m.id} className="text-[12px]">
                                      {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[11.5px] text-[#C0685C]">未指派</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
