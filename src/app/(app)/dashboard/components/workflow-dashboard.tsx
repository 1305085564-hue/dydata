"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { submitSopCheckpointAction } from "@/app/actions/sop";
import { cn } from "@/lib/utils";
import type { SopCheckpoint, SopMemberStatus } from "@/types";
import { StatusBadge } from "./status-badge";
import {
  PRODUCTION_CHECKPOINTS,
  STATUS_THEME,
  emptyMember,
  emptyStatuses,
  getLatestSubmission,
} from "./status-theme";

interface ReviewFeedback {
  videoTitle: string;
  mainIssues: string;
  nextAction: string;
  managerComment?: string;
}

interface WorkflowDashboardProps {
  mine: SopMemberStatus | null;
  today: string;
  hasTodayReport: boolean;
  isPending: boolean;
  activeCheckpoint: SopCheckpoint;
  onSubmitted: (nextMine?: SopMemberStatus) => void;
  dataReport: React.ReactNode;
  reviewFeedback?: ReviewFeedback | null;
}

/**
 * 今日生产流程看板
 * 法典 V1：步骤圆圈无 scale/shadow-lg；无 animate-pulse；无彩底
 */
export function WorkflowDashboard({
  mine,
  today,
  hasTodayReport,
  isPending,
  activeCheckpoint,
  onSubmitted,
  dataReport,
  reviewFeedback,
}: WorkflowDashboardProps) {
  const [topicText, setTopicText] = useState(
    () => getLatestSubmission(mine ?? emptyMember(today), "TOPIC")?.topic_text ?? "",
  );
  const [scriptText, setScriptText] = useState(
    () => getLatestSubmission(mine ?? emptyMember(today), "SCRIPT")?.script_text ?? "",
  );
  const [videoUrl, setVideoUrl] = useState(
    () => getLatestSubmission(mine ?? emptyMember(today), "VIDEO")?.video_url ?? "",
  );
  const [isSubmitting, startSubmit] = useTransition();
  const statuses = {
    ...(mine?.statuses ?? emptyStatuses()),
    DATA_REPORT: hasTodayReport
      ? ("APPROVED" as const)
      : (mine?.statuses.DATA_REPORT ?? "IDLE"),
  };
  const scriptSubmission = mine ? getLatestSubmission(mine, "SCRIPT") : null;
  const activeStatus = statuses[activeCheckpoint];
  const stageTitle =
    activeCheckpoint === "DATA_REPORT"
      ? "数据报表上传"
      : activeCheckpoint === "TOPIC"
        ? "选题上报"
        : activeCheckpoint === "SCRIPT"
          ? "脚本内容录入"
          : activeCheckpoint === "VIDEO"
            ? "审片发布链接"
      : "早会复盘确认";

  const buildOptimisticStatus = (checkpoint: SopCheckpoint): SopMemberStatus => {
    const now = new Date().toISOString();
    const baseMember = mine ?? emptyMember(today);
    const nextStatus = "SUBMITTED" as const;
    const nextSubmission = {
      id: `optimistic-${checkpoint}-${now}`,
      user_id: baseMember.userId,
      team_id: baseMember.teamId,
      group_id: baseMember.groupId,
      status_date: today,
      checkpoint,
      topic_text: checkpoint === "TOPIC" || checkpoint === "SCRIPT" ? topicText : null,
      script_text: checkpoint === "SCRIPT" ? scriptText : null,
      video_url: checkpoint === "VIDEO" ? videoUrl : null,
      notes: null,
      review_status: nextStatus,
      submitted_at: now,
      updated_at: now,
    };

    return {
      ...baseMember,
      statuses: {
        ...baseMember.statuses,
        [checkpoint]: nextStatus,
      },
      submissions: [
        nextSubmission,
        ...baseMember.submissions.filter((submission) => submission.checkpoint !== checkpoint),
      ],
    };
  };

  const submitCheckpoint = (checkpoint: SopCheckpoint) => {
    const previousMine = mine ?? undefined;
    const optimisticMine = buildOptimisticStatus(checkpoint);
    toast.success("卡点已提交");
    onSubmitted(optimisticMine);

    startSubmit(async () => {
      const result = await submitSopCheckpointAction({
        checkpoint,
        statusDate: today,
        topicText: checkpoint === "TOPIC" ? topicText : undefined,
        scriptText: checkpoint === "SCRIPT" ? scriptText : undefined,
        videoUrl: checkpoint === "VIDEO" ? videoUrl : undefined,
      });

      if (result.error) {
        onSubmitted(previousMine);
        toast.error(result.error);
        return;
      }

      onSubmitted(result.data?.status);
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {activeCheckpoint === "DATA_REPORT" ? (
        <>{dataReport}</>
      ) : activeCheckpoint === "MORNING_REVIEW" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="flex justify-center">
            <StatusBadge status={statuses.MORNING_REVIEW} />
          </div>
          <h3 className="mt-4 text-[18px] font-semibold tracking-tight text-zinc-800">
            早会复盘
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-[13px] leading-[1.7] text-zinc-500">
            早会仍按线下执行，页面只记录状态。需要留痕时点击确认即可点亮节点。
          </p>
          <button
            onClick={() => submitCheckpoint("MORNING_REVIEW")}
            disabled={isSubmitting || isPending}
            className="mt-8 rounded-lg bg-[#D97757] px-10 py-3 text-[12px] font-medium uppercase tracking-[0.1em] text-white transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#C96442] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          >
            确认早会完成
          </button>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-8">
            <div className="space-y-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <StatusBadge status={activeStatus} />
                  <h3 className="text-[18px] font-semibold tracking-tight text-zinc-800">
                    {stageTitle}
                  </h3>
                </div>
                <div className="text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                  #{scriptSubmission?.id.slice(0, 8) ?? "DY-SOP"}
                </div>
              </div>

              <div className="grid gap-4">
                {activeCheckpoint === "TOPIC" || activeCheckpoint === "SCRIPT" ? (
                  <textarea
                    value={topicText}
                    onChange={(event) => setTopicText(event.target.value)}
                    className={cn(
                      "w-full resize-none rounded-xl border border-zinc-200 bg-white p-5 text-[13px] font-medium leading-[1.7] text-zinc-800 tracking-wide transition-[border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5",
                      activeCheckpoint === "TOPIC" ? "h-56 text-[14px]" : "h-24",
                    )}
                    placeholder="写选题核心，例如：为什么说今天的反弹不是安全信号？"
                  />
                ) : null}

                {activeCheckpoint === "SCRIPT" ? (
                  <textarea
                    value={scriptText}
                    onChange={(event) => setScriptText(event.target.value)}
                    className="h-80 w-full resize-none rounded-xl border border-zinc-200 bg-white p-8 text-[14px] font-medium leading-[1.7] text-zinc-800 tracking-wide transition-[border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    placeholder="请在此输入 1000-1300 字的脚本详情..."
                  />
                ) : null}

                {activeCheckpoint === "VIDEO" ? (
                  <input
                    value={videoUrl}
                    onChange={(event) => setVideoUrl(event.target.value)}
                    className="rounded-xl border border-zinc-200 bg-white px-5 py-5 text-[14px] font-medium text-zinc-800 tracking-wide transition-[border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    placeholder="粘贴抖音成片链接，审核中心可直接跳转"
                  />
                ) : null}
              </div>

              <div className="flex flex-col justify-between gap-4 mt-6 sm:flex-row sm:items-center">
                <div className="flex gap-3">
                  {activeCheckpoint === "SCRIPT" ? (
                    <button
                      onClick={() => submitCheckpoint("TOPIC")}
                      disabled={isSubmitting || isPending}
                      className="rounded-[10px] border border-zinc-200 bg-zinc-50 px-5 py-2.5 text-[12px] font-medium text-zinc-600 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    >
                      同步选题修改
                    </button>
                  ) : null}
                </div>
                <button
                  onClick={() => submitCheckpoint(activeCheckpoint)}
                  disabled={isSubmitting || isPending}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#D97757] px-10 py-3 text-[12px] font-medium uppercase tracking-[0.1em] text-white transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#C96442] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                >
                  确认提交 <ArrowUpRight size={14} className="stroke-[1.5]" />
                </button>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <div className="h-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <h4 className="mb-8 border-b border-zinc-100 pb-4 text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                状态通知
              </h4>
              <div className="space-y-5">
                {PRODUCTION_CHECKPOINTS.map((checkpoint) => {
                  const theme = STATUS_THEME[statuses[checkpoint.id]];
                  return (
                    <div
                      key={checkpoint.id}
                      className="rounded-xl bg-white p-5"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                          {checkpoint.label}
                        </span>
                        <StatusBadge status={statuses[checkpoint.id]} minimal />
                      </div>
                      <p className="text-[13px] font-medium leading-[1.7] text-zinc-700">
                        {STATUS_THEME[statuses[checkpoint.id]].label}
                        {mine?.currentBlocker === checkpoint.id ? " · 当前阻塞节点" : ""}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* 复盘反馈区 */}
              <div className="mt-8 border-t border-zinc-100 pt-6">
                <h4 className="mb-4 text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                  复盘反馈
                </h4>
                {reviewFeedback ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-[12px] text-zinc-400">上一条视频</div>
                      <div className="mt-1 text-[13px] font-medium text-zinc-800 line-clamp-2">
                        {reviewFeedback.videoTitle}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-[12px] text-zinc-400">主要问题</div>
                      <div className="mt-1 text-[13px] text-zinc-700">{reviewFeedback.mainIssues}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-[12px] text-zinc-400">下一条动作</div>
                      <div className="mt-1 text-[13px] text-zinc-700">{reviewFeedback.nextAction}</div>
                    </div>
                    {reviewFeedback.managerComment && (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-[12px] text-zinc-400">管理者反馈</div>
                        <div className="mt-1 text-[13px] text-zinc-700">{reviewFeedback.managerComment}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-center">
                    <p className="text-[13px] text-zinc-400">暂无复盘反馈</p>
                    <p className="mt-1 text-[12px] text-zinc-400">完成视频发布后将收到改进建议</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
