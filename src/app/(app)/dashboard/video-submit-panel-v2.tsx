"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { 
  CalendarDays, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  FilePlus, 
  History, 
  ShieldAlert, 
  Sparkles, 
  TrendingUp, 
  Zap,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { VideoSubmitFormV2 } from "./video-submit-form-v2";
import {
  getTodaySubmissionSummary,
  resolveSubmissionDayStatus,
  resolveSubmitPanelMode,
  type TodaySubmissionReportLike,
  type SubmitPanelRequestedMode,
} from "./video-submit-panel-state";
import {
  getExemptionDatesForMonth,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import { cn } from "@/lib/utils";

export interface VideoSubmitPanelV2Props {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  activeBizDate?: string;
  onActiveBizDateChange?: (date: string) => void;
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: any[];
  history: any[];
  accountIds?: string[];
  ownContentDirections?: string[];
  accountDisplayNameMap?: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  embeddedChrome?: boolean;
}

export function VideoSubmitPanelV2({
  accounts,
  selectedAccountId: propsSelectedAccountId,
  onSelectedAccountChange,
  activeBizDate: propsActiveBizDate,
  onActiveBizDateChange,
  userId,
  userDisplayName,
  today,
  todayReports,
  monthReports,
  history,
  userExemptionProfile,
  userExemptionGrants,
}: VideoSubmitPanelV2Props) {
  // 当前选中的账号 ID
  const [internalAccountId, setInternalAccountId] = useState<string>(accounts[0]?.id || "");
  const selectedAccountId = propsSelectedAccountId || internalAccountId;

  const setSelectedAccountId = (id: string) => {
    setInternalAccountId(id);
    onSelectedAccountChange?.(id);
  };

  // 选中的活跃操作日期 (默认今日)
  const [internalBizDate, setInternalBizDate] = useState<string>(today);
  const activeBizDate = propsActiveBizDate || internalBizDate;

  const setActiveBizDate = (date: string) => {
    setInternalBizDate(date);
    onActiveBizDateChange?.(date);
  };

  // 模态或展开请求模式
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);

  // 快捷刷新回调
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 获取当前选中账号的今日提交 Summary
  const summary = useMemo(() => {
    return getTodaySubmissionSummary(todayReports, selectedAccountId);
  }, [todayReports, selectedAccountId, refreshTrigger]);

  // 计算当前的 Panel 渲染模式: summary | create | editToday | backfill
  const mode = useMemo(() => {
    return resolveSubmitPanelMode({ summary, requestedMode });
  }, [summary, requestedMode]);

  // 月度已提交与免交日期列表
  const monthSubmittedDates = useMemo(() => {
    return monthReports
      .filter((r) => r.account_id === selectedAccountId)
      .map((r) => r.report_date);
  }, [monthReports, selectedAccountId]);

  const exemptionBuckets = useMemo(() => {
    return getExemptionDatesForMonth(
      userExemptionProfile,
      today,
      userExemptionGrants
    );
  }, [userExemptionProfile, today, userExemptionGrants]);

  // 快捷选择日期打卡
  const handleSelectCalendarDate = useCallback((date: string) => {
    setActiveBizDate(date);
    if (date === today) {
      if (summary) {
        setRequestedMode("editToday");
      } else {
        setRequestedMode(null);
      }
    } else {
      setRequestedMode("backfill");
    }
  }, [today, summary, setActiveBizDate]);

  // 全局 Esc 阻泥退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && requestedMode !== null) {
        setRequestedMode(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestedMode]);

  return (
    <div className="space-y-6">
      {/* 1. 工作舱顶部：月度出勤状态卡 & 快捷切账号 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左侧 2 栏：日历与打卡概览 (L1 容器白底 + 1px 细边) */}
        <Card className="lg:col-span-2 border-zinc-200/80 bg-white shadow-sm rounded-2xl">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4 mb-4">
              <div>
                <h3 className="text-[16px] font-semibold text-zinc-900 flex items-center gap-2">
                  <CalendarDays className="size-4 text-[#5F82A8]" />
                  月度提交与考勤打卡
                </h3>
                <p className="text-[13px] text-zinc-500 mt-0.5">
                  点击日期节点可进行当日补交或数据查阅
                </p>
              </div>

              {/* 账号快速切换指示器 */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-zinc-500">对应账号：</span>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[13px] font-medium text-zinc-800 focus:outline-none"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 出勤日历组件 */}
            <SubmissionCalendar
              today={today}
              selectedDate={activeBizDate}
              submittedDates={monthSubmittedDates}
              waiveDates={exemptionBuckets.waiveDates}
              leaveDates={exemptionBuckets.leaveDates}
              onDateSelect={handleSelectCalendarDate}
            />
          </CardContent>
        </Card>

        {/* 右侧 1 栏：今日状态面板与快捷卡片 */}
        <Card className="border-zinc-200/80 bg-white shadow-sm rounded-2xl flex flex-col justify-between">
          <CardContent className="p-6 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider">
                  TODAY STATUS
                </span>
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                  summary 
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                )}>
                  {summary ? "今日已打卡" : "今日待填报"}
                </span>
              </div>

              <h4 className="mt-3 text-[20px] font-semibold text-zinc-900">
                {summary ? (summary.title || "已提交短视频作品") : "尚未录入今日数据"}
              </h4>
              <p className="mt-1 text-[13px] text-zinc-500">
                {summary 
                  ? `发布时间: ${summary.publishedAt ? summary.publishedAt.slice(0, 16) : "暂未标注"}`
                  : "完成每日数据填报，驱动智能爆款分析与复盘"}
              </p>

              {/* 关键播放数据预览 (如果有 summary) */}
              {summary && (
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 border border-zinc-100">
                  <div>
                    <span className="text-[12px] text-zinc-400">24h 播放量</span>
                    <p className="text-[18px] font-bold text-zinc-900">
                      {summary.playCount !== null ? summary.playCount.toLocaleString() : "0"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[12px] text-zinc-400">完播率</span>
                    <p className="text-[18px] font-bold text-zinc-900">
                      {summary.completionRate || "0%"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 操作入口 */}
            <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center gap-3">
              {summary ? (
                <Button
                  onClick={() => setRequestedMode("editToday")}
                  variant="outline"
                  className="w-full text-[13px] hover:bg-zinc-100 flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="size-4 text-zinc-600" />
                  编辑今日提交
                </Button>
              ) : (
                <Button
                  onClick={() => setRequestedMode(null)}
                  className="w-full bg-[#D97757] text-white hover:bg-[#C46A4D] active:scale-[0.97] text-[14px] font-medium shadow-sm flex items-center justify-center gap-2"
                >
                  <Zap className="size-4 fill-white/20" />
                  立即填报今日数据
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. 主表单与填报区域 (冷灰纸感体验) */}
      <AnimatePresence mode="wait">
        {(mode === "create" || mode === "editToday" || mode === "backfill") && (
          <VideoSubmitFormV2
            key={`${selectedAccountId}-${activeBizDate}-${mode}`}
            accounts={accounts}
            userId={userId}
            userDisplayName={userDisplayName}
            today={today}
            activeBizDate={activeBizDate}
            initialSummary={mode === "editToday" ? summary : undefined}
            onSubmitSuccess={() => {
              setRefreshTrigger((prev) => prev + 1);
              setRequestedMode(null);
              toast.success("工作台记录已更新");
            }}
            onCancel={requestedMode !== null ? () => setRequestedMode(null) : undefined}
          />
        )}

        {mode === "summary" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm flex flex-col items-center justify-center text-center min-h-[220px]"
          >
            <div className="size-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 mb-3 border border-green-100">
              <CheckCircle2 className="size-6" />
            </div>
            <h3 className="text-[17px] font-semibold text-zinc-900">今日数据打卡成功</h3>
            <p className="text-[13px] text-zinc-500 max-w-md mt-1">
              您已成功完成《{summary?.title || "抖音作品"}》的播放数据及协作归属填报。数据将实时同步至数据大盘与复盘中心。
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRequestedMode("editToday")}
                className="text-[13px]"
              >
                修正指标数据
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setActiveBizDate(today);
                  setRequestedMode("backfill");
                }}
                className="bg-zinc-900 text-white hover:bg-zinc-800 text-[13px]"
              >
                再次提交其他作品
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
