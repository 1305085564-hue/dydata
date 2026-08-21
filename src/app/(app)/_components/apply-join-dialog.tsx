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
  const [errorText, setErrorText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!teamId) {
      setErrorText("请选择团队");
      return;
    }
    setErrorText("");

    const submittedTeamId = teamId;
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
          <DialogTitle className="text-[18px] font-semibold tracking-tight text-zinc-900">
            申请加入团队
          </DialogTitle>
          <DialogDescription className="text-[13px] text-zinc-500">
            提交后由管理员审核，通过后你将正式归属该团队
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="apply-team-id">目标团队</Label>
          <select
            id="apply-team-id"
            className={`flex h-8 w-full rounded-lg border border-transparent bg-zinc-50 px-3 text-[13px] text-zinc-900 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:bg-white focus-visible:border-zinc-200 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-950/5 ${errorText ? "ring-1 ring-red-300" : ""}`}
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              if (errorText) setErrorText("");
            }}
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
          {errorText && <p className="text-red-500 text-xs mt-1">{errorText}</p>}
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
