"use client";

/**
 * 生产控制系统 · 主编排
 * 只负责组合子组件、传递数据；状态逻辑在 use-dashboard-orchestration.ts
 */

import type { SopMemberStatus } from "@/types";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";
import { useEffect, useState } from "react";
import { setDashboardDate } from "@/lib/dashboard-store";
import type { ContentFeedbackCardDetail } from "@/types";

import { DashboardWorkspaceHeader } from "./components/dashboard-workspace-header";
import { DataReportStage } from "./components/data-report-stage";
import { FocusHeroCard } from "./components/focus-hero-card";
import { GlobalMatrix } from "./components/global-matrix";
import { LeaderDashboard } from "./components/leader-dashboard";
import { WorkflowDashboard } from "./components/workflow-dashboard";
import { useDashboardOrchestration } from "./components/use-dashboard-orchestration";

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
  const {
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
  } = useDashboardOrchestration({
    initialMine,
    initialMatrix,
    today,
    userDisplayName,
    userRole,
    accounts,
    userId,
    todayReports,
    hasPendingExemption,
    userExemptionReviewNotice,
    teamReviewRequests,
  });

  const [feedbackCard, setFeedbackCard] = useState<ContentFeedbackCardDetail | null>(null);
  const [feedbackVideoTitle, setFeedbackVideoTitle] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchCard = async () => {
      try {
        const res = await fetch("/api/dashboard/content-feedback-cards");
        if (!res.ok) return;
        const data = (await res.json()) as {
          items?: Array<{
            video?: { video_title?: string | null } | null;
            feedback_card?: ContentFeedbackCardDetail;
          }>;
        };
        const first = data.items?.[0];
        if (active && first?.feedback_card) {
          setFeedbackCard(first.feedback_card);
          setFeedbackVideoTitle(first.video?.video_title ?? null);
          // 如果是 sent 状态，自动标记为 viewed
          if (first.feedback_card.workflow_status === "sent" && first.feedback_card.card_id) {
            await fetch(`/api/dashboard/content-feedback-cards/${first.feedback_card.card_id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "viewed" }),
            });
          }
        }
      } catch {}
    };
    fetchCard();
    return () => { active = false; };
  }, []);

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
          activeCheckpoint={activeCheckpoint}
          onCheckpointChange={setActiveCheckpoint}
          checkpointStatuses={{
            ...(mine?.statuses ?? {
              DATA_REPORT: "IDLE",
              MORNING_REVIEW: "IDLE",
              TOPIC: "IDLE",
              SCRIPT: "IDLE",
              VIDEO: "IDLE",
            }),
            DATA_REPORT: todayReports.length > 0 ? "APPROVED" : (mine?.statuses.DATA_REPORT ?? "IDLE"),
          }}
          assistantSlot={undefined}
        />

        {userRole === "member" && activeTab === "FLOW" && (
          <div className="mx-auto mb-6 max-w-6xl">
            <FocusHeroCard
              todayReports={todayReports}
              totalAccounts={accounts.length}
              userDisplayName={userDisplayName}
              userRole={userRole}
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
            onSubmitted={refreshSop}
            reviewFeedback={
              feedbackCard?.confirmed
                ? {
                    videoTitle: feedbackVideoTitle ?? "未命名视频",
                    mainIssues: feedbackCard.confirmed.summary.problem_tags.join(" / ") || feedbackCard.confirmed.summary.one_line || "",
                    nextAction: feedbackCard.confirmed.actions.instructions.slice(0, 2).join("；") || "",
                    managerComment: feedbackCard.confirmed.actions.message_for_member || undefined,
                  }
                : null
            }
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
