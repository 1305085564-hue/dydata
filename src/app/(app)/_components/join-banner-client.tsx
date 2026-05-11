"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { TeamOption } from "@/lib/teams";

import { ApplyJoinDialog } from "./apply-join-dialog";
import { cancelJoinRequestAction } from "./join-actions";

type Props =
  | { mode: "unassigned"; teams: TeamOption[] }
  | { mode: "pending"; requestId: string; targetTeamName: string };

export function JoinBannerClient(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [isDismissed, setIsDismissed] = useState(false);

  if (props.mode === "unassigned") {
    return (
      <div className="mx-auto mb-4 flex max-w-[var(--app-max-width,1200px)] items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5">
        <div className="flex items-center gap-2.5 text-[13px]">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#D99E55]" aria-hidden />
          <span className="text-zinc-800">你还未加入团队</span>
          <span className="text-zinc-500">目前仅能查看自己的数据</span>
        </div>
        <ApplyJoinDialog
          teams={props.teams}
          trigger={
            <Button size="sm">
              申请加入团队
            </Button>
          }
        />
      </div>
    );
  }

  if (isDismissed) {
    return null;
  }

  const handleCancel = () => {
    if (isPending) return;
    setIsDismissed(true);
    feedbackToast.success("已撤销申请");

    startTransition(async () => {
      const result = await cancelJoinRequestAction(props.requestId);
      if (!result.ok) {
        setIsDismissed(false);
        feedbackToast.error(result.error);
      }
    });
  };

  return (
    <div className="mx-auto mb-4 flex max-w-[var(--app-max-width,1200px)] items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5">
      <div className="flex items-center gap-2.5 text-[13px]">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#D99E55]" aria-hidden />
        <span className="text-zinc-800">申请审核中</span>
        <span className="text-zinc-500">目标团队：{props.targetTeamName || "未知"}</span>
      </div>
      <Button size="sm" variant="outline" onClick={handleCancel} disabled={isPending}>
        {isPending ? "撤销中" : "撤销申请"}
      </Button>
    </div>
  );
}
