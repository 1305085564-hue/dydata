"use client";

import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { TeamOption } from "@/lib/teams";

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
  // 状态只在标题说一次（不再另挂「未加入/审核中/未通过」标签）；正文只补标题没说的：哪个团队、为什么、能做什么
  const bannerBody = isRejected
    ? [props.targetTeamName, props.reviewNote].filter(Boolean).join("：")
    : isUnassigned
      ? "目前只能查看自己的数据，加入后才能提交日报、豁免和协作内容。"
      : `目标团队：${targetTeamName || "未知"}，审核通过前仍可继续使用当前账号。`;

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
      <div className="mx-auto mb-4 w-full max-w-[var(--app-rail,80rem)]">
        <div className="flex flex-col gap-3 rounded-xl border border-[#E2E2DF] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[14px] leading-[1.60]">
            <span role="heading" aria-level={2} className="text-[#141413]">{bannerTitle}</span>
            {bannerBody && <span className="text-[#78716C]"> · {bannerBody}</span>}
          </p>
          <Button
            type="button"
            size="sm"
            variant={isUnassigned ? "default" : "outline"}
            onClick={isUnassigned ? openApply : handleCancel}
            className="shrink-0 self-start sm:self-auto"
          >
            {isRejected ? "重新申请加入团队" : isUnassigned ? "申请加入团队" : "撤销申请"}
          </Button>
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
