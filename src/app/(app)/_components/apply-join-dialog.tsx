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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      setErrorText("选一个团队");
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
          <DialogTitle className="text-base font-medium tracking-tight text-[#1C1917]">
            申请加入团队
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#292524]">
            提交后由管理员审核，通过后你将正式归属该团队
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="apply-team-id">目标团队</Label>
          <Select
            value={teamId}
            onValueChange={(val) => {
              setTeamId(val || "");
              if (errorText) setErrorText("");
            }}
            disabled={isPending}
          >
            <SelectTrigger
              id="apply-team-id"
              className={`h-8 w-full rounded-lg border border-[#E5E0D6] px-3 text-[13px] text-[#1C1917] hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 ${errorText ? "ring-1 ring-red-300" : ""}`}
            >
              <SelectValue>
                {teamId ? teams.find((t) => t.id === teamId)?.name || "选一个目标团队" : "选一个目标团队"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E5E0D6] shadow-claude-float min-w-44">
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errorText && <p className="text-[#C0685C] text-xs mt-1">{errorText}</p>}
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
