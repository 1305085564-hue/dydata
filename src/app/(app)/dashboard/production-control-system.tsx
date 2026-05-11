"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  getMyTodaySopStatusAction,
  getSopMatrixAction,
} from "@/app/actions/sop";
import type { SopCheckpoint, SopMemberStatus } from "@/types";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import {
  groupDashboardAlerts,
  type DashboardAlertLike,
} from "./alert-groups";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";
import {
  initDashboardStore,
  setDashboardAccount,
  setDashboardDate,
} from "@/lib/dashboard-store";

import { AlertCenter } from "./components/alert-center";
import { DashboardWorkspaceHeader } from "./components/dashboard-workspace-header";
import { DataReportStage } from "./components/data-report-stage";
import { FocusHeroCard } from "./components/focus-hero-card";
import { GlobalMatrix } from "./components/global-matrix";
import { LeaderDashboard } from "./components/leader-dashboard";
import { WorkflowDashboard } from "./components/workflow-dashboard";
import type { WorkspaceTab } from "./components/status-theme";

interface ProductionControlSystemProps {
  initialMine: SopMemberStatus | null;
  initialMatrix: SopMemberStatus[];
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
  userExemptionReviewNotice: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  teamReviewRequests: DashboardPageData["teamReviewRequests"];
}

/**
 * 生产控制系统 · 主编排
 * 只负责组合、数据编排、事件分发；视觉细节全部下沉到 ./components/*
 * 法典 V1：main 背景用 bg-zinc-50；× 毛玻璃
 */
export function ProductionControlSystem({
  initialMine,
  initialMatrix,
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
  userExemptionReviewNotice,
  userExemptionProfile,
  userExemptionGrants,
  teamReviewRequests,
}: ProductionControlSystemProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("FLOW");
  const [activeCheckpoint, setActiveCheckpoint] =
    useState<SopCheckpoint>("DATA_REPORT");
  const [selectedAccountId, setSelectedAccountId] = useState(
    accounts[0]?.id ?? "",
  );
  const [activeBizDate, setActiveBizDate] = useState(today);
  const pendingDashboardActionRef = useRef<string | null>(null);
  const [mine, setMine] = useState(initialMine);
  const [matrix, setMatrix] = useState(initialMatrix);
  const [isPending, startTransition] = useTransition();
  const [alerts, setAlerts] = useState<DashboardAlertLike[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [expandedAlertUsers, setExpandedAlertUsers] = useState<Set<string>>(
    new Set(),
  );
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

  const refreshSop = (nextMine?: SopMemberStatus) => {
    if (nextMine) setMine(nextMine);

    startTransition(async () => {
      const isAdminOrOwner = userRole === "admin" || userRole === "owner";
      const sharedPromise = isAdminOrOwner
        ? getSopMatrixAction({ statusDate: today })
        : Promise.resolve({ data: null });

      const [mineResult, sharedResult] = await Promise.all([
        getMyTodaySopStatusAction({ statusDate: today }),
        sharedPromise,
      ]);

      if (mineResult.data) setMine(mineResult.data);
      if (isAdminOrOwner && sharedResult.data) {
        setMatrix(sharedResult.data);
      }
    });
  };

  const openReviewTarget = () => {
    setActiveTab("REVIEW");
  };

  const dispatchDashboardAction = (key: string) => {
    window.dispatchEvent(
      new CustomEvent("dydata-dashboard-action", { detail: { key } }),
    );
  };

  const openDashboardTool = (key: string) => {
    if (activeTab === "FLOW" && activeCheckpoint === "DATA_REPORT") {
      dispatchDashboardAction(key);
      return;
    }

    pendingDashboardActionRef.current = key;
    setActiveTab("FLOW");
    setActiveCheckpoint("DATA_REPORT");
  };

  useEffect(() => {
    if (
      !pendingDashboardActionRef.current ||
      activeTab !== "FLOW" ||
      activeCheckpoint !== "DATA_REPORT"
    )
      return;

    const action = pendingDashboardActionRef.current;
    pendingDashboardActionRef.current = null;
    dispatchDashboardAction(action);
  }, [activeCheckpoint, activeTab]);

  useEffect(() => {
    let active = true;
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/sop/alerts?statusDate=${today}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.ok) setAlerts(data.alerts ?? []);
      } catch {}
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [today]);

  const dismissAlert = (id: string) =>
    setDismissedAlerts((prev) => new Set(prev).add(id));
  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));
  const alertGroups = useMemo(
    () => groupDashboardAlerts(visibleAlerts),
    [visibleAlerts],
  );
  const toggleAlertUser = (userKey: string) => {
    setExpandedAlertUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userKey)) next.delete(userKey);
      else next.add(userKey);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-800 antialiased">
      <main className="p-4 lg:p-8">
        <DashboardWorkspaceHeader
          today={today}
          activeBizDate={activeBizDate}
          onDateChange={(date) => {
            setActiveBizDate(date);
            setDashboardDate(date);
          }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onDashboardAction={openDashboardTool}
          hasPendingExemption={hasPendingExemption}
          submittedDates={submittedDates}
          userRole={userRole}
          alertCount={alertGroups.length}
          reviewRequestCount={teamReviewRequests.length}
        />

        <AlertCenter
          groups={alertGroups}
          expanded={alertsExpanded}
          expandedUsers={expandedAlertUsers}
          onToggleExpanded={() => setAlertsExpanded((prev) => !prev)}
          onToggleUser={toggleAlertUser}
          onDismissAlert={dismissAlert}
        />

        {userRole === "member" && activeTab === "FLOW" && (
          <div className="mx-auto mb-6 max-w-6xl">
            <FocusHeroCard
              todayReports={todayReports}
              totalAccounts={accounts.length}
              userDisplayName={userDisplayName}
              today={today}
            />
          </div>
        )}

        {activeTab === "FLOW" && (
          <WorkflowDashboard
            mine={mine}
            today={today}
            hasTodayReport={todayReports.length > 0}
            isPending={isPending}
            activeCheckpoint={activeCheckpoint}
            onCheckpointChange={setActiveCheckpoint}
            onSubmitted={refreshSop}
            dataReport={
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
                userExemptionReviewNotice={userExemptionReviewNotice}
                userExemptionProfile={userExemptionProfile}
                userExemptionGrants={userExemptionGrants}
                teamReviewRequests={teamReviewRequests}
              />
            }
          />
        )}
        {activeTab === "REVIEW" &&
          (userRole === "admin" || userRole === "owner" ? (
            <LeaderDashboard today={today} userRole={userRole} teamReviewRequests={teamReviewRequests} />
          ) : null)}
        {activeTab === "MATRIX" &&
          (userRole === "admin" || userRole === "owner") && (
            <GlobalMatrix rows={matrix} onOpenTarget={openReviewTarget} />
          )}
      </main>
    </div>
  );
}
