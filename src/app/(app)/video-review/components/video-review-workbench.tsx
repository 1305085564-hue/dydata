"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  CalendarDays,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApprovedList } from "./approved-list";
import { SubmitDialog } from "./submit-dialog";
import { ExemptionDialog } from "./exemption-dialog";
import { DashboardDialog } from "./dashboard-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import type { ApprovedDraftItem } from "./types";
import { getVideoReviewAdminActions } from "./video-review-admin-actions";

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
  initialSubmissions: any[];
  initialDashboardData: DashboardRecord[];
  teams: TeamOrGroup[];
  groups: TeamOrGroup[];
  approvedItems: ApprovedDraftItem[];
  searchQuery: string;
  selectedTeamId: string;
  selectedGroupId: string;
  errorMsg?: string;
}

export function VideoReviewWorkbench({
  isAdmin,
  userId,
  todayDate,
  initialTarget,
  initialSubmittedCount,
  initialSubmissions,
  initialDashboardData,
  teams,
  groups,
  approvedItems,
  searchQuery,
  selectedTeamId,
  selectedGroupId,
  errorMsg,
}: VideoReviewWorkbenchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Dialogs Open State
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exemptionOpen, setExemptionOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  // Dynamic submissions state
  const [submissions, setSubmissions] = useState<any[]>(initialSubmissions);
  const adminActions = getVideoReviewAdminActions();

  // Refresh page data and update submissions state
  const handleRefreshData = async () => {
    startTransition(() => {
      router.refresh();
    });

    try {
      const res = await fetch(`/api/work-submissions?date=${todayDate}`);
      const json = await res.json();
      if (json.data) {
        setSubmissions(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete submission
  const handleDeleteSubmission = async (id: string) => {
    try {
      const res = await fetch(`/api/work-submissions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
        toast.success("删除成功");
        startTransition(() => {
          router.refresh();
        });
      } else {
        const json = await res.json();
        toast.error(json.error || "删除失败");
      }
    } catch (e) {
      toast.error("操作失败，请重试");
    }
  };

  // Metrics calculation
  const target = initialTarget;
  const submittedCount = submissions.length;
  const gap = Math.max(0, target - submittedCount);
  const isTargetMet = submittedCount >= target;

  // Workbench level Lightbox (for DashboardDialog zoom shots)
  const [workbenchLightbox, setWorkbenchLightbox] = useState<{ paths: string[]; index: number } | null>(null);

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-800">
          <AlertTriangle className="size-5 shrink-0 text-red-600" />
          <div>
            <span className="font-semibold">数据加载部分失败：</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* 顶部标题与全局操作面板 */}
      <header className="rounded-2xl border border-stone-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-normal text-stone-500">
              产量对账
            </p>
            <h1 className="mt-1 text-[24px] font-medium text-stone-900">
              视频审核与产量对账
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-[1.6] text-stone-500">
              这里是全队视频凭证的工作台。绿色表示达标，红色表示还未交齐。支持点击右上角快捷上传。
            </p>
          </div>

          {/* 全局操作按钮区 */}
          <div className="flex flex-wrap items-center gap-2">

            {/* 辅助操作: 申请豁免 (请假) */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setExemptionOpen(true)}
              className="h-9 rounded-lg border-stone-200 text-stone-700 hover:bg-stone-100 font-medium gap-1.5"
            >
              <CalendarDays className="size-4 text-stone-500" />
              申请豁免
            </Button>

            {/* 唯一主 CTA: 上传作品 */}
            <Button
              id="workbench-upload-btn"
              type="button"
              onClick={() => setSubmitOpen(true)}
              className="h-9 rounded-lg bg-[#D97757] font-medium text-white hover:bg-[#C96442] active:scale-95 transition-transform gap-1.5"
            >
              <Upload className="size-4" />
              上传作品凭证
            </Button>

            {/* 管理员快捷入口 */}
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDashboardOpen(true)}
                className="h-9 rounded-lg border-stone-200 text-stone-700 hover:bg-stone-100 font-medium gap-1.5"
              >
                <BarChart3 className="size-4 text-stone-500" />
                {adminActions[0]?.label ?? "产量看板"}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 核心指标条 - 紧凑轻量化设计 */}
      <div className="inline-flex flex-wrap items-center gap-4 bg-stone-100/80 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-700/80 rounded-xl px-4 py-2 text-[12px] text-stone-700 dark:text-stone-500 w-fit">
        <div className="flex items-center gap-1">
          <span className="font-medium text-stone-500">今日目标:</span>
          <span className="font-normal tabular-nums text-stone-700 dark:text-[#E7E5E4]">
            {target}
          </span>
          <span className="text-stone-500">个作品</span>
        </div>
        <div className="w-[1px] h-3 bg-stone-300 dark:bg-stone-800" />
        <div className="flex items-center gap-1">
          <span className="font-medium text-stone-500">已交凭证:</span>
          <span className="font-normal tabular-nums text-stone-700 dark:text-[#E7E5E4]">
            {submittedCount}
          </span>
          <span className="text-stone-500">个作品</span>
        </div>
        <div className="w-[1px] h-3 bg-stone-300 dark:bg-stone-800" />
        <div className="flex items-center gap-1">
          <span className="font-medium text-stone-500">还差额:</span>
          <span className={cn(
            "font-normal tabular-nums",
            gap > 0 ? "text-[#C9604D]" : "text-[#6FAA7D]"
          )}>
            {gap}
          </span>
          <span className="text-stone-500">个作品</span>
        </div>
      </div>

      {/* 核心单栏布局展示区 */}
      <div className="relative">
        <div className="space-y-4">
          <ApprovedList
            items={approvedItems}
            query={searchQuery}
            currentUserId={userId}
          />
        </div>

        {isPending && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[0.5px] z-10 rounded-2xl transition-opacity duration-300 pointer-events-none" />
        )}
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
