/* useDashboardOrchestration · 生产控制系统的状态 + 副作用 + 事件分发 */

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
import {
  groupDashboardAlerts,
  type DashboardAlertLike,
} from "../alert-groups";
import type { TodaySubmissionReportLike } from "../video-submit-panel-state";
import {
  initDashboardStore,
  setDashboardAccount,
  setDashboardDate,
} from "@/lib/dashboard-store";
import type { WorkspaceTab } from "./status-theme";

interface OrchestrationInput {
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
  hasPendingExemption?: boolean;
  userExemptionReviewNotice: DashboardPageData["userExemptionReviewNotice"];
  teamReviewRequests: DashboardPageData["teamReviewRequests"];
}

export function useDashboardOrchestration({
  initialMine,
  initialMatrix,
  today,
  userDisplayName,
  userRole,
  accounts,
  userId,
  todayReports,
  userExemptionReviewNotice,
  teamReviewRequests,
}: OrchestrationInput) {
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
  const [dismissedReviewNoticeIds, setDismissedReviewNoticeIds] = useState<Set<string>>(new Set());

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

  // 初始化 store + 监听外部事件
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

  // 刷新 SOP 状态
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

  // Tab / checkpoint 导航
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

  // 延迟分发 pending action
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

  // 轮询 alerts
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

  // 恢复已关闭的豁免通知
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dydata:dismissed-exemption-review-notices");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissedReviewNoticeIds(
          new Set(parsed.filter((item): item is string => typeof item === "string")),
        );
      }
    } catch {}
  }, []);

  const dismissAlert = (id: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(id));
    if (userExemptionReviewNotice && id === `exemption-review-${userExemptionReviewNotice.id}`) {
      setDismissedReviewNoticeIds((prev) => {
        const next = new Set(prev).add(userExemptionReviewNotice.id);
        try {
          window.localStorage.setItem(
            "dydata:dismissed-exemption-review-notices",
            JSON.stringify(Array.from(next)),
          );
        } catch {}
        return next;
      });
    }
  };

  const exemptionAlert = useMemo<DashboardAlertLike | null>(() => {
    if (!userExemptionReviewNotice) return null;
    if (dismissedReviewNoticeIds.has(userExemptionReviewNotice.id)) return null;
    const approved = userExemptionReviewNotice.request_status === "approved";
    return {
      id: `exemption-review-${userExemptionReviewNotice.id}`,
      severity: approved ? "info" : "critical",
      message:
        userExemptionReviewNotice.reason?.trim() ||
        (approved
          ? "管理员已批准你的豁免申请。"
          : "管理员驳回了你的豁免申请。"),
      userId: userId,
      userName: userDisplayName,
      checkpointLabel: approved ? "豁免已通过" : "豁免未通过",
      sourceType: approved ? "exemption_approved" : "exemption_rejected",
    };
  }, [userExemptionReviewNotice, dismissedReviewNoticeIds, userId, userDisplayName]);

  const visibleAlerts = useMemo(() => {
    const base = alerts.filter((a) => !dismissedAlerts.has(a.id));
    return exemptionAlert ? [exemptionAlert, ...base] : base;
  }, [alerts, dismissedAlerts, exemptionAlert]);

  const alertGroups = useMemo(
    () => groupDashboardAlerts(visibleAlerts),
    [visibleAlerts],
  );

  return {
    activeTab,
    setActiveTab,
    activeCheckpoint,
    setActiveCheckpoint,
    selectedAccountId,
    setSelectedAccountId,
    activeBizDate,
    setActiveBizDate,
    mine,
    matrix,
    isPending,
    submittedDates,
    alertGroups,
    refreshSop,
    openReviewTarget,
    openDashboardTool,
    dismissAlert,
    teamReviewRequests,
  };
}
