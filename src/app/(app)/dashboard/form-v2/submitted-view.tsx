"use client";

import { motion } from "framer-motion";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, CheckCircle, PencilLine, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ColophonMark } from "@/components/editorial/editorial-illustrations";
import { getPublishedDateKey } from "@/lib/business-time";
import type { FormMetaState } from "@/lib/video-submit/domain/video-submit-form-model";
import type {
  SubmissionQualityIssue,
  SubmissionUiState,
} from "@/lib/video-submit-workflow/ui-state";

export interface SubmittedViewProps {
  meta: FormMetaState;
  setHasUserInteracted: Dispatch<SetStateAction<boolean>>;
  handleGoToTopics: () => void;
  setIsSubmitted: (
    next: boolean | ((current: boolean) => boolean),
  ) => void;
  setSubmittedReportId: (
    next: string | null | ((current: string | null) => string | null),
  ) => void;
  submittedReportId: string | null;
  submittedReportDate?: string | null;
  submittedVideoId: string | null;
  setQualityCheck: (
    next:
      | SubmissionUiState["qualityCheck"]
      | ((current: SubmissionUiState["qualityCheck"]) => SubmissionUiState["qualityCheck"]),
  ) => void;
  qualityCheck: SubmissionUiState["qualityCheck"];
  onRequestEdit?: (target: { reportId: string | null; reportDate: string }) => void;
  onCancel?: () => void;
  onCreateAnother?: () => void;
  handleQualityCheck: () => void;
  handleFixIssue: (issue: SubmissionQualityIssue) => void;
  onViewHistory?: () => void;
  onViewVideo?: (videoId: string) => void;
}

export function SubmittedView({
  meta,
  setHasUserInteracted,
  handleGoToTopics,
  setIsSubmitted,
  setSubmittedReportId,
  submittedReportId,
  submittedReportDate,
  submittedVideoId,
  setQualityCheck,
  qualityCheck,
  onRequestEdit,
  onCancel,
  onCreateAnother,
  handleQualityCheck,
  handleFixIssue,
  onViewVideo,
}: SubmittedViewProps) {
  const publishedDate = submittedReportDate ?? getPublishedDateKey({
    published_at: meta.publishedAt || null,
    report_date: meta.bizDate,
  }) ?? meta.bizDate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl space-y-4 pb-2"
    >
      {/* 交完只说一件事：交上了。页头已变「今天已交」，这里说交了什么；下一步退成文字链接 */}
      <Card className="flex flex-row items-center gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-[14px] text-[#141413]">{meta.videoTitle || "未命名作品"}</p>
          <p className="truncate text-[12px] tabular-nums text-[#78716C]">
            {publishedDate} 发布 · 已写入日报与 24 小时数据
            {submittedReportId ? <> · 编号 <span className="select-text font-mono">{submittedReportId.slice(0, 8)}</span></> : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="m"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setHasUserInteracted(true);
            setIsSubmitted(false);
            setQualityCheck({ data: null, loading: false });
            if (onRequestEdit) {
              onRequestEdit({ reportId: submittedReportId, reportDate: submittedReportDate ?? publishedDate });
            } else onCancel?.();
          }}
        >
          <PencilLine className="mr-1 size-3.5 text-[#78716C]" />
          修改
        </Button>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-[14px]">
        {onCreateAnother ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHasUserInteracted(true);
              setIsSubmitted(false);
              setSubmittedReportId(null);
              setQualityCheck({ data: null, loading: false });
              onCreateAnother();
            }}
            className="text-[#1F1E1D] hover:text-[#141413] hover:underline cursor-pointer"
          >
            再交一条
          </button>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setHasUserInteracted(true);
            handleGoToTopics();
          }}
          className="text-[#1F1E1D] hover:text-[#141413] hover:underline cursor-pointer"
        >
          去选题库挑明天的选题 →
        </button>
        {submittedVideoId && onViewVideo ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHasUserInteracted(true);
              setIsSubmitted(false);
              setSubmittedReportId(null);
              onViewVideo(submittedVideoId);
            }}
            className="text-[#78716C] hover:text-[#141413] hover:underline cursor-pointer"
          >
            看这条的数据复盘
          </button>
        ) : null}
        <button
          type="button"
          disabled={qualityCheck.loading}
          onClick={(e) => {
            e.stopPropagation();
            setHasUserInteracted(true);
            handleQualityCheck();
          }}
          className="inline-flex items-center gap-1 text-[#78716C] hover:text-[#141413] hover:underline disabled:cursor-wait cursor-pointer"
        >
          <Sparkles className="size-3.5" />
          {qualityCheck.loading ? "AI 分析中…" : "AI 检查样本质量"}
        </button>
      </div>

      {qualityCheck.data ? (
        <div className="rounded-xl border border-[#E2E2DF] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge
              variant={
                qualityCheck.data.overallStatus === "pass"
                  ? "success"
                  : qualityCheck.data.overallStatus === "warning"
                    ? "warning"
                    : "danger"
              }
            >
              {qualityCheck.data.overallStatus === "pass"
                ? "通过"
                : qualityCheck.data.overallStatus === "warning"
                  ? "警告"
                  : "未通过"}
            </Badge>
            <span className="text-[12px] text-[#78716C]">
              检查于{" "}
              {new Date(qualityCheck.data.checkedAt).toLocaleTimeString(
                "zh-CN",
                { hour: "2-digit", minute: "2-digit" },
              )}
            </span>
          </div>
          <div className="space-y-3">
            {qualityCheck.data.issues.map((issue, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  {issue.severity === "critical" ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />
                  ) : issue.severity === "warning" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
                  ) : (
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-status-success" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[14px] font-normal text-[#1F1E1D]">
                      {issue.title}
                    </p>
                    <p className="text-[12px] text-[#78716C]">
                      {issue.detail}
                    </p>
                  </div>
                </div>
                {issue.suggestedFix ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={issue.suggestedFix === "manual_review"}
                    onClick={() => handleFixIssue(issue)}
                    className="h-8 shrink-0 rounded-xl border-[#E2E2DF] px-3 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                  >
                    {issue.suggestedFix === "edit_field"
                      ? "修改"
                      : issue.suggestedFix === "reupload_screenshot"
                        ? "重传"
                        : "需复核"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-center justify-center gap-1 pt-2 pb-4 select-none">
        <ColophonMark className="py-0 gap-2" />
        <span className="text-[14px] text-[#78716C]">今日创作已立卷 · 数据已妥善入库</span>
      </div>
    </motion.div>
  );
}
