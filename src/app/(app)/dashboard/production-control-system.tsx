"use client";

/**
 * 生产控制系统 · 主编排
 * 只保留数据报表主工作台，组合头部、概览卡和填报面板。
 */

import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";
import { useEffect, useMemo, useState } from "react";
import {
  initDashboardStore,
  setDashboardAccount,
  setDashboardDate,
} from "@/lib/dashboard-store";

import { DashboardWorkspaceHeader } from "./components/dashboard-workspace-header";
import { DataReportStage } from "./components/data-report-stage";
import { FocusHeroCard } from "./components/focus-hero-card";

interface ProductionControlSystemProps {
  today: string;
  userDisplayName: string;
  userRole: "member" | "admin" | "owner";
  accounts: {
    id: string;
    name: string;
    display_name: string;
    content_direction: string | null;
  }[];
  userId: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: Array<
    Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }
  >;
  history: Array<
    Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }
  >;
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  teamReviewRequests: DashboardPageData["teamReviewRequests"];
}

export function ProductionControlSystem({
  today,
  userDisplayName,
  userRole,
  accounts,
  userId,
  todayReports,
  monthReports,
  history,
  accountIds,
  ownContentDirections,
  accountDisplayNameMap,
  hasPendingExemption = false,
  userExemptionProfile,
  userExemptionGrants,
  teamReviewRequests,
}: ProductionControlSystemProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [activeBizDate, setActiveBizDate] = useState(today);
  const submittedDates = useMemo(
    () =>
      Array.from(
        new Set(
          todayReports
            .map((report) => report.report_date)
            .filter((date): date is string => Boolean(date)),
        ),
      ),
    [todayReports],
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
    <div className="min-h-screen bg-zinc-50 text-zinc-800 antialiased">
      <main className="px-4 py-3 lg:px-8 lg:py-5">
        <DashboardWorkspaceHeader
          today={today}
          activeBizDate={activeBizDate}
          onDateChange={(date) => {
            setActiveBizDate(date);
            setDashboardDate(date);
          }}
          onDashboardAction={openDashboardTool}
          hasPendingExemption={hasPendingExemption}
          submittedDates={submittedDates}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectedAccountChange={(accountId) => {
            setSelectedAccountId(accountId);
            setDashboardAccount(accountId);
          }}
          userDisplayName={userDisplayName}
          userRole={userRole}
        />

        {userRole === "member" && (
          <div className="mx-auto mb-4 max-w-6xl">
            <FocusHeroCard
              todayReports={todayReports}
              totalAccounts={accounts.length}
              userDisplayName={userDisplayName}
              userRole={userRole}
              today={today}
              accounts={accounts}
            />
          </div>
        )}

        <DataReportStage
          key={`${selectedAccountId}-${activeBizDate}`}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectedAccountChange={setSelectedAccountId}
          activeBizDate={activeBizDate}
          onActiveBizDateChange={setActiveBizDate}
          userId={userId}
          userDisplayName={userDisplayName}
          today={today}
          todayReports={todayReports}
          monthReports={monthReports}
          history={history}
          accountIds={accountIds}
          ownContentDirections={ownContentDirections}
          accountDisplayNameMap={accountDisplayNameMap}
          hasPendingExemption={hasPendingExemption}
          userExemptionProfile={userExemptionProfile}
          userExemptionGrants={userExemptionGrants}
          teamReviewRequests={teamReviewRequests}
        />
      </main>
    </div>
  );
}
