"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, CalendarDays, BarChart3, Bell, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovedList } from "./approved-list";
import { SubmitDialog } from "./submit-dialog";
import { ExemptionDialog } from "./exemption-dialog";
import { DashboardDialog } from "./dashboard-dialog";
import { ApprovalDialog } from "./approval-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import type { ApprovedDraftItem } from "./types";

interface DashboardRecord {
  user_id: string;
  user_name: string;
  team_id: string;
  team_name: string;
  group_id: string;
  group_name: string;
  daily_target: number;
  submitted_count: number;
  gap: number;
  exemption_status: "none" | "pending" | "approved" | "rejected";
  alert_level: "green" | "yellow" | "red";
}

interface TeamOrGroup {
  id: string;
  name: string;
}

interface VideoReviewWorkbenchProps {
  isAdmin: boolean;
  userId: string;
  todayDate: string;
  initialTarget: number;
  initialSubmittedCount: number;
  pendingExemptionsCount: number;
  initialDashboardData: DashboardRecord[];
  teams: TeamOrGroup[];
  groups: TeamOrGroup[];
  approvedItems: ApprovedDraftItem[];
  searchQuery: string;
  selectedTeamId: string;
  selectedGroupId: string;
}

export function VideoReviewWorkbench({
  isAdmin,
  userId,
  todayDate,
  initialTarget,
  initialSubmittedCount,
  pendingExemptionsCount,
  initialDashboardData,
  teams,
  groups,
  approvedItems,
  searchQuery,
  selectedTeamId,
  selectedGroupId,
}: VideoReviewWorkbenchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Dialogs Open State
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exemptionOpen, setExemptionOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  // Dynamic submitted count state (so submitting updates it immediately before page refresh completes)
  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);

  // Refresh page data
  const handleRefreshData = async () => {
    startTransition(() => {
      router.refresh();
    });
    
    // Fetch count from api dynamically to sync client immediately
    try {
      const res = await fetch(`/api/work-submissions?date=${todayDate}`);
      const json = await res.json();
      if (json.data) {
        setSubmittedCount(json.data.length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Workbench level Lightbox (for DashboardDialog zoom shots)
  const [workbenchLightbox, setWorkbenchLightbox] = useState<{ paths: string[]; index: number } | null>(null);

  return (
    <div className="space-y-6">
      {/* 顶部标题与全局操作面板 (L1 Card, bg-white, 24px/16px 留白) */}
      <header className="rounded-2xl border border-stone-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-400 font-mono">
              Fulfillment & Quota
            </p>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight text-stone-850">
              视频审核与产量对账
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-[1.6] text-stone-500">
              这里是全队视频凭证的工作台。绿灯达标，红灯表示未交齐。点击右上角快捷上传。
            </p>
          </div>

          {/* 全局操作按钮区 (唯一橙色 CTA) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 管理特权: 消息审批中心 (铃铛右上角悬浮红色徽章，数字居中) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setApprovalOpen(true)}
                className="relative flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-800 transition-colors mr-1"
                title="审批中心"
              >
                <Bell className="size-4.5 stroke-[1.75]" />
                {pendingExemptionsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C9604D] px-1 text-[10px] font-bold font-mono text-white ring-2 ring-white">
                    {pendingExemptionsCount}
                  </span>
                )}
              </button>
            )}

            {/* 管理特权: 产量看板 */}
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDashboardOpen(true)}
                className="h-9 rounded-xl border-stone-200 text-stone-700 hover:bg-stone-100 font-semibold gap-1.5"
              >
                <BarChart3 className="size-4 text-stone-500" />
                产量看板
              </Button>
            )}

            {/* 辅助操作: 申请豁免 (请假) */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setExemptionOpen(true)}
              className="h-9 rounded-xl border-stone-200 text-stone-700 hover:bg-stone-100 font-semibold gap-1.5"
            >
              <CalendarDays className="size-4 text-stone-500" />
              申请豁免
            </Button>

            {/* 唯一主 CTA: 上传作品 (暖橙色 #D97757) */}
            <Button
              type="button"
              onClick={() => setSubmitOpen(true)}
              className="h-9 rounded-xl bg-[#D97757] font-semibold text-white hover:bg-[#C96442] active:scale-95 transition-transform gap-1.5"
            >
              <Upload className="size-4" />
              上传作品凭证
            </Button>
          </div>
        </div>

        {/* 个人今日产量速览 (仅对普通组员更有用，放在顶部低调展示) */}
        <div className="flex items-center gap-3 py-2 border-t border-stone-100 text-[12px] text-stone-500">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-stone-300" />
            <span>今日指标：今天需要交 <span className="font-bold text-stone-700 font-mono">{initialTarget}</span> 条</span>
          </div>
          <span className="text-stone-350">•</span>
          <div className="flex items-center gap-1.5">
            <span className={submittedCount >= initialTarget ? "text-[#6FAA7D]" : "text-stone-500"}>
              已交凭证：<span className="font-bold font-mono">{submittedCount}</span> 条
            </span>
          </div>
          {submittedCount >= initialTarget ? (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6FAA7D]">
              <CheckCircle2 className="size-3.5 stroke-[2.5]" />
              已达标
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#D97757]">
              <AlertTriangle className="size-3.5" />
              未交齐 (还差 {Math.max(0, initialTarget - submittedCount)} 条)
            </span>
          )}
        </div>
      </header>

      {/* 卡片网格流展示区 */}
      <div className="space-y-4">
        <ApprovedList
          items={approvedItems}
          query={searchQuery}
          currentUserId={userId}
        />
      </div>

      {/* 弹窗组件挂载 */}
      <SubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        userId={userId}
        target={initialTarget}
        submittedCount={submittedCount}
        todayDate={todayDate}
        onSubmitSuccess={handleRefreshData}
      />

      <ExemptionDialog
        open={exemptionOpen}
        onOpenChange={setExemptionOpen}
        todayDate={todayDate}
        onSubmitSuccess={handleRefreshData}
      />

      {isAdmin && (
        <DashboardDialog
          open={dashboardOpen}
          onOpenChange={setDashboardOpen}
          initialData={initialDashboardData}
          teams={teams}
          groups={groups}
          selectedDate={todayDate}
          selectedTeamId={selectedTeamId}
          selectedGroupId={selectedGroupId}
          onOpenLightbox={(paths, idx) => {
            setWorkbenchLightbox({ paths, index: idx });
          }}
        />
      )}

      {isAdmin && (
        <ApprovalDialog
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          onSubmitSuccess={handleRefreshData}
        />
      )}

      {/* 看板大图查看器 */}
      {workbenchLightbox && (
        <ImageLightbox
          paths={workbenchLightbox.paths}
          currentIndex={workbenchLightbox.index}
          onClose={() => setWorkbenchLightbox(null)}
          onNavigate={(idx) =>
            setWorkbenchLightbox((prev) => (prev ? { ...prev, index: idx } : prev))
          }
        />
      )}
    </div>
  );
}
