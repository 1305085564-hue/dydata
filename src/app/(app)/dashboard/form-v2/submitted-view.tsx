"use client";

import { motion } from "framer-motion";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Compass,
  PencilLine,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { ZenFinishedIllustration } from "@/components/editorial/editorial-illustrations";
import type { FormMetaState } from "../video-submit-form-model";
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
  setQualityCheck: (
    next:
      | SubmissionUiState["qualityCheck"]
      | ((current: SubmissionUiState["qualityCheck"]) => SubmissionUiState["qualityCheck"]),
  ) => void;
  qualityCheck: SubmissionUiState["qualityCheck"];
  onRequestEdit?: () => void;
  onCancel?: () => void;
  handleQualityCheck: () => void;
  handleFixIssue: (issue: SubmissionQualityIssue) => void;
}

export function SubmittedView({
  meta,
  setHasUserInteracted,
  handleGoToTopics,
  setIsSubmitted,
  setSubmittedReportId,
  setQualityCheck,
  qualityCheck,
  onRequestEdit,
  onCancel,
  handleQualityCheck,
  handleFixIssue,
}: SubmittedViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4 pb-2"
    >
      {/* 提交成功页面 - 禅意立卷与挑选明日选题闭环 */}
      <div className="py-8 text-center select-none space-y-4">
        <div className="flex justify-center -mt-2 -mb-2">
          <ZenFinishedIllustration size={96} />
        </div>
        <div className="space-y-1">
          <SectionHeading as="h3">
            今日创作已成功立卷
          </SectionHeading>
          <p className="text-[13px] text-[#78716C]">
            归属日期：<span className="tabular-nums font-normal text-[#141413]">{meta.bizDate}</span> · 记录已安全落库
          </p>
        </div>

        {/* 主行动：挑选明日选题闭环 */}
        <div className="pt-2 flex flex-col items-center gap-3">
          <Button
            type="button"
            size="l"
            onClick={(e) => {
              e.stopPropagation();
              setHasUserInteracted(true);
              handleGoToTopics();
            }}
            className="w-full max-w-xs font-normal text-[13px] shadow-input cursor-pointer"
          >
            <Compass className="size-4" />
            <span>去选题库挑选明日选题</span>
          </Button>

          {/* 辅助操作 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="m"
              onClick={(e) => {
                e.stopPropagation();
                setHasUserInteracted(true);
                setIsSubmitted(false);
                setSubmittedReportId(null);
                setQualityCheck({ data: null, loading: false });
                onRequestEdit ? onRequestEdit() : onCancel?.();
              }}
              className="px-3 text-[12px] text-[#1F1E1D] cursor-pointer font-normal"
            >
              <PencilLine className="mr-1 size-3.5 text-[#78716C]" />
              查看并修改
            </Button>
            <Button
              variant="secondary"
              size="m"
              onClick={(e) => {
                e.stopPropagation();
                setHasUserInteracted(true);
                setIsSubmitted(false);
                setSubmittedReportId(null);
                setQualityCheck({ data: null, loading: false });
                onCancel?.();
              }}
              className="px-3 text-[12px] text-[#1F1E1D] cursor-pointer"
            >
              留在工作台
            </Button>
            <Button
              variant="secondary"
              size="m"
              disabled={qualityCheck.loading}
              onClick={(e) => {
                e.stopPropagation();
                setHasUserInteracted(true);
                handleQualityCheck();
              }}
              className="px-3 text-[12px] text-[#1F1E1D] cursor-pointer"
            >
              {qualityCheck.loading ? (
                <>AI 分析中…</>
              ) : (
                <>
                  <Sparkles className="mr-1 size-3.5 text-[#D97757]" />
                  AI 检查样本质量
                </>
              )}
            </Button>
          </div>
        </div>
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
                    <p className="text-[13px] font-normal text-[#1F1E1D]">
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
    </motion.div>
  );
}
