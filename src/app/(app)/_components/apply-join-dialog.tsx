"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { TeamOption } from "@/lib/teams";

import { submitJoinRequestAction } from "./join-actions";

type Props = {
  teams: TeamOption[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ApplyJoinDialog({ teams, trigger, open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [teamId, setTeamId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!teamId) {
      feedbackToast.error("请选择要申请的团队");
      return;
    }

    const submittedTeamId = teamId;
    feedbackToast.success("申请已提交，等待管理员审核");
    setOpen(false);
    setTeamId("");

    startTransition(async () => {
      const result = await submitJoinRequestAction(submittedTeamId);
      if (!result.ok) {
        setTeamId(submittedTeamId);
        setOpen(true);
        feedbackToast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={<span>{trigger}</span>} /> : null}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-800">
            申请加入团队
          </DialogTitle>
          <DialogDescription className="text-[13px] text-stone-500">
            提交后由管理员审核，通过后你将正式归属该团队
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="apply-team-id">目标团队</Label>
          <select
            id="apply-team-id"
            className="flex h-8 w-full rounded-lg border border-transparent bg-stone-50 px-3 text-[13px] text-stone-800 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:bg-white focus-visible:border-stone-200 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-stone-950/5"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={isPending}
          >
            <option value="" disabled>
              请选择目标团队
            </option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !teamId}>
            {isPending ? "提交中" : "提交申请"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
