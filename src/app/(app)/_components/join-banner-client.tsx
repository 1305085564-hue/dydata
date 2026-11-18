"use client";

import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ItemHeading } from "@/components/ui/item-heading";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import type { TeamOption } from "@/lib/teams";

import { Clock, Users } from "lucide-react";
import { ApplyJoinDialog } from "./apply-join-dialog";
import { cancelJoinRequestAction } from "./join-actions";

type Props =
  | { mode: "unassigned"; teams: TeamOption[] }
  | { mode: "pending"; requestId: string; targetTeamName: string }
  | { mode: "rejected"; teams: TeamOption[]; targetTeamName: string; reviewNote: string | null };

export function JoinBannerClient(props: Props) {
  const [, startTransition] = useTransition();
  const [applyOpen, setApplyOpen] = useState(false);

  const openApply = useCallback(() => setApplyOpen(true), []);

  const requestId = props.mode === "pending" ? props.requestId : null;
  const targetTeamName = props.mode === "pending" ? props.targetTeamName : null;
  const isRejected = props.mode === "rejected";
  // 未通过和未加入都是「可以（重新）申请」的状态，共用申请入口
  const isUnassigned = props.mode === "unassigned" || isRejected;
  const bannerTitle = isRejected ? "入团申请未通过" : isUnassigned ? "你还未加入团队" : "团队申请审核中";
  const bannerBody = isRejected
    ? `${props.targetTeamName ? `${props.targetTeamName}：` : ""}未通过${props.reviewNote ? `：${props.reviewNote}` : ""}`
    : isUnassigned
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
        <div className="flex flex-col gap-3 rounded-xl border border-[#E2E2DF]/60 bg-white p-3 text-[14px] text-[#78716C] transition sm:flex-row sm:items-center sm:justify-between">
          {/* 左侧：图标、标题与说明 */}
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-xl",
                isUnassigned
                  ? "bg-[#D97757]/10 text-[#D97757]"
                  : "bg-status-info/10 text-status-info",
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
                <ItemHeading as="h2" className="tracking-tight">
                  {bannerTitle}
                </ItemHeading>
                <Badge variant={isUnassigned ? "warning" : "accent"}>
                  {isRejected ? "未通过" : isUnassigned ? "未加入" : "审核中"}
                </Badge>
              </div>
              <p className="text-[14px] leading-relaxed text-[#1F1E1D]">
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
                  ? "px-3.5 text-[12px] sm:text-[14px]"
                  : "border-[#E2E2DF] px-3.5 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] sm:text-[14px]"
              }
            >
              {isRejected ? "重新申请加入团队" : isUnassigned ? "申请加入团队" : "撤销申请"}
            </Button>
            <span className="hidden text-[12px] text-[#78716C] sm:inline-block">
              {isUnassigned
                ? "通过后即可提交日报、豁免和协作内容。"
                : "审核通过前仍可继续使用当前账号。"}
            </span>
          </div>
        </div>
      </div>

      {props.mode !== "pending" ? (
        <ApplyJoinDialog
          teams={props.teams}
          open={applyOpen}
          onOpenChange={setApplyOpen}
        />
      ) : null}
    </>
  );
}
