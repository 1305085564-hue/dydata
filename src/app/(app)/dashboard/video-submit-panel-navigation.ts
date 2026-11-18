import { useCallback } from "react";
import {
  resolvePanelDateSelection,
} from "@/lib/video-submit/domain/panel-state";
import type { SubmitPanelRequestedMode } from "@/lib/dashboard-submission-state";

type SubmittedEditTarget = { reportId: string | null; reportDate: string } | null;

export function useVideoSubmitPanelNavigation(input: {
  activityAvailable: boolean;
  activityFailed: boolean;
  loadActivity: () => unknown;
  today: string;
  setActiveBizDate: (date: string) => void;
  setSelectedReportId: (reportId: string | null) => void;
  setSubmittedEditTarget: (target: SubmittedEditTarget) => void;
  setSubmittedViewActive: (active: boolean) => void;
  setRequestedMode: (mode: SubmitPanelRequestedMode) => void;
  setIsHistoryOpen: (open: boolean) => void;
  onSelectedAccountChange?: (accountId: string) => void;
}) {
  const {
    activityAvailable,
    activityFailed,
    loadActivity,
    today,
    setActiveBizDate,
    setSelectedReportId,
    setSubmittedEditTarget,
    setSubmittedViewActive,
    setRequestedMode,
    setIsHistoryOpen,
    onSelectedAccountChange,
  } = input;
  const selectBizDate = useCallback((date: string) => {
    setActiveBizDate(date);
    setSelectedReportId(null);
    setSubmittedEditTarget(null);
    const nextState = resolvePanelDateSelection(
      date,
      today,
      activityAvailable,
      activityFailed,
    );
    setRequestedMode(nextState.requestedMode);
    setSubmittedViewActive(nextState.submittedViewActive);
    if (nextState.shouldLoadActivity) void loadActivity();
  }, [activityAvailable, activityFailed, loadActivity, setActiveBizDate, setRequestedMode, setSelectedReportId, setSubmittedEditTarget, setSubmittedViewActive, today]);

  const requestHistoryEdit = useCallback((target: {
    accountId: string;
    reportId: string;
    reportDate: string;
  }) => {
    onSelectedAccountChange?.(target.accountId);
    setActiveBizDate(target.reportDate);
    setSelectedReportId(target.reportId);
    setSubmittedEditTarget({ reportId: target.reportId, reportDate: target.reportDate });
    setSubmittedViewActive(false);
    setRequestedMode("editToday");
    setIsHistoryOpen(false);
  }, [onSelectedAccountChange, setActiveBizDate, setIsHistoryOpen, setRequestedMode, setSelectedReportId, setSubmittedEditTarget, setSubmittedViewActive]);

  return { selectBizDate, requestHistoryEdit };
}
