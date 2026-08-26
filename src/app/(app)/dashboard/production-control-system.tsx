"use client";

/**
 * 生产控制系统 · 主编排
 * 只保留数据报表主工作台，组合头部、概览卡和填报面板。
 */

import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";
import { useEffect, useMemo, useState } from "react";
import {
  initDashboardStore,
  setDashboardAccount,
  setDashboardDate,
} from "@/lib/dashboard-store";

import { VideoSubmitPanelV2 } from "./video-submit-panel-v2";

interface ProductionControlSystemProps {
  today: string;
  userDisplayName: string;
  accounts: {
    id: string;
    name: string;
    display_name: string;
    content_direction: string | null;
  }[];
  userId: string;
  todayReports: TodaySubmissionReportLike[];
  monthSubmittedDates: string[];
  monthReports: Array<
    Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }
  >;
  history: Array<
    Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }
  >;
  accountIds: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionReviewNotice: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}

export function ProductionControlSystem({
  today,
  userDisplayName,
  accounts,
  userId,
  todayReports,
  monthSubmittedDates,
  monthReports,
  history,
  accountIds,
  accountDisplayNameMap,
  hasPendingExemption = false,
  userExemptionReviewNotice,
  userExemptionProfile,
  userExemptionGrants,
}: ProductionControlSystemProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [activeBizDate, setActiveBizDate] = useState(today);
  const submittedDates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...monthSubmittedDates,
            ...todayReports.map((report) => report.report_date),
            ...monthReports.map((report) => report.report_date),
          ].filter((date): date is string => Boolean(date)),
        ),
      ),
    [monthReports, monthSubmittedDates, todayReports],
  );

  useEffect(() => {
    initDashboardStore({
      accounts,
      selectedAccountId,
      activeBizDate,
    });

    function handleExternalAction(event: Event) {
      const detail = (
        event as CustomEvent<{ key?: string; accountId?: string; date?: string }>
      ).detail;
      if (detail?.key === "set-account" && detail.accountId) {
        setSelectedAccountId(detail.accountId);
        setActiveBizDate(today);
        setDashboardAccount(detail.accountId);
      }
      if (detail?.key === "set-date" && detail.date) {
        setActiveBizDate(detail.date);
        setDashboardDate(detail.date);
      }
    }

    window.addEventListener("dydata-dashboard-action", handleExternalAction);
    return () =>
      window.removeEventListener("dydata-dashboard-action", handleExternalAction);
  }, [accounts, selectedAccountId, activeBizDate, today]);

  function openDashboardTool(key: string) {
    window.dispatchEvent(
      new CustomEvent("dydata-dashboard-action", { detail: { key } }),
    );
  }

  return (
    <div className="antialiased max-w-5xl mx-auto">
      <VideoSubmitPanelV2
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectedAccountChange={setSelectedAccountId}
        activeBizDate={activeBizDate}
        onActiveBizDateChange={setActiveBizDate}
        userId={userId}
        userDisplayName={userDisplayName}
        today={today}
        todayReports={todayReports}
        monthSubmittedDates={submittedDates}
        monthReports={monthReports}
        history={history}
        accountIds={accountIds}
        accountDisplayNameMap={accountDisplayNameMap}
        hasPendingExemption={hasPendingExemption}
        {...{ userExemptionReviewNotice }}
        userExemptionProfile={userExemptionProfile}
        userExemptionGrants={userExemptionGrants}
      />
    </div>
  );
}
