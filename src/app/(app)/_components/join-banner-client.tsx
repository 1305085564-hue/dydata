"use client";

import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import type { TeamOption } from "@/lib/teams";

import { Clock, Users } from "lucide-react";
import { ApplyJoinDialog } from "./apply-join-dialog";
import { cancelJoinRequestAction } from "./join-actions";

type Props =
  | { mode: "unassigned"; teams: TeamOption[] }
  | { mode: "pending"; requestId: string; targetTeamName: string };

export function JoinBannerClient(props: Props) {
  const [, startTransition] = useTransition();
  const [applyOpen, setApplyOpen] = useState(false);

  const openApply = useCallback(() => setApplyOpen(true), []);

  const requestId = props.mode === "pending" ? props.requestId : null;
  const targetTeamName = props.mode === "pending" ? props.targetTeamName : null;
  const isUnassigned = props.mode === "unassigned";
  const bannerTitle = isUnassigned ? "你还未加入团队" : "团队申请审核中";
  const bannerBody = isUnassigned
    ? "目前只能查看自己的数据。申请加入团队后，才能参与团队协作和豁免流程。"
    : `目标团队：${targetTeamName || "未知"}`;

  const handleCancel = useCallback(() => {
    if (!requestId) return;
    startTransition(async () => {
      const result = await cancelJoinRequestAction(requestId);
      if (!result.ok) {
        feedbackToast.error(result.error);
      }
    });
  }, [requestId, startTransition]);

  return (
    <>
      <div className="mx-auto mb-3.5 w-full max-w-7xl sm:mb-4">
        <div className="flex flex-col gap-3 rounded-lg border border-[#ECE7DE] bg-[#FAF8F4] p-3 text-[13px] text-[#78716C] transition-all sm:flex-row sm:items-center sm:justify-between">
          {/* 左侧：图标、标题与说明 */}
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                isUnassigned
                  ? "bg-[#D97757]/10 text-[#D97757]"
                  : "bg-[#43718E]/10 text-[#43718E]",
              )}
            >
              {isUnassigned ? (
                <Users className="size-4 stroke-[1.8]" />
              ) : (
                <Clock className="size-4 stroke-[1.8]" />
              )}
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-medium tracking-tight text-[#1C1917]">
                  {bannerTitle}
                </h2>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium tracking-wide",
                    isUnassigned
                      ? "bg-[#D97757]/10 text-[#D97757]"
                      : "bg-[#43718E]/10 text-[#43718E]",
                  )}
                >
                  {isUnassigned ? "未加入" : "审核中"}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-[#292524]">
                {bannerBody}
              </p>
            </div>
          </div>

          {/* 右侧：主操作与辅助提示 */}
          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
            <Button
              type="button"
              size="sm"
              variant={isUnassigned ? "default" : "outline"}
              onClick={isUnassigned ? openApply : handleCancel}
              className={
                isUnassigned
                  ? "px-3.5 text-xs sm:text-[13px]"
                  : "border-[#E5E0D6] px-3.5 text-xs text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] sm:text-[13px]"
              }
            >
              {isUnassigned ? "申请加入团队" : "撤销申请"}
            </Button>
            <span className="hidden text-[12px] text-[#78716C] sm:inline-block">
              {isUnassigned
                ? "通过后即可提交日报、豁免和协作内容。"
                : "审核通过前仍可继续使用当前账号。"}
            </span>
          </div>
        </div>
      </div>

      {props.mode === "unassigned" ? (
        <ApplyJoinDialog
          teams={props.teams}
          open={applyOpen}
          onOpenChange={setApplyOpen}
        />
      ) : null}
    </>
  );
}
