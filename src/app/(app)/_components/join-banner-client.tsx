"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { feedbackToast } from "@/components/ui/feedback-toast";
import { useNotifications } from "@/components/notifications/notification-store";
import type { TeamOption } from "@/lib/teams";

import { ApplyJoinDialog } from "./apply-join-dialog";
import { cancelJoinRequestAction } from "./join-actions";

type Props =
  | { mode: "unassigned"; teams: TeamOption[] }
  | { mode: "pending"; requestId: string; targetTeamName: string };

export function JoinBannerClient(props: Props) {
  const [, startTransition] = useTransition();
  const [applyOpen, setApplyOpen] = useState(false);
  const { setLocalNotification } = useNotifications();

  const openApply = useCallback(() => setApplyOpen(true), []);

  const requestId = props.mode === "pending" ? props.requestId : null;
  const targetTeamName = props.mode === "pending" ? props.targetTeamName : null;

  const handleCancel = useCallback(() => {
    if (!requestId) return;
    startTransition(async () => {
      const result = await cancelJoinRequestAction(requestId);
      if (result.ok) {
        feedbackToast.success("已撤销申请");
      } else {
        feedbackToast.error(result.error);
      }
    });
  }, [requestId, startTransition]);

  useEffect(() => {
    if (props.mode === "unassigned") {
      setLocalNotification("team.unassigned", {
        key: "team.unassigned",
        type: "team.unassigned",
        category: "todo",
        severity: "warning",
        title: "你还未加入团队",
        body: "目前仅能查看自己的数据，申请加入后即可参与团队协作。",
        primaryActionLabel: "申请加入团队",
        primaryAction: openApply,
      });
      return () => setLocalNotification("team.unassigned", null);
    }

    setLocalNotification("team.pending", {
      key: "team.pending",
      type: "team.pending",
      category: "todo",
      severity: "info",
      title: "团队申请审核中",
      body: `目标团队：${targetTeamName || "未知"}`,
      primaryActionLabel: "撤销申请",
      primaryAction: handleCancel,
    });
    return () => setLocalNotification("team.pending", null);
  }, [props.mode, targetTeamName, openApply, handleCancel, setLocalNotification]);

  if (props.mode === "unassigned") {
    return (
      <ApplyJoinDialog
        teams={props.teams}
        open={applyOpen}
        onOpenChange={setApplyOpen}
      />
    );
  }

  return null;
}