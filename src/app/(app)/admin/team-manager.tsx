"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeam } from "./actions";

interface Team {
  id: string;
  name: string;
}

interface TeamManagerProps {
  teams: Team[];
}

export function TeamManager({ teams }: TeamManagerProps) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const result = await createTeam(teamName);
      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success(`已新增团队：${teamName.trim()}`);
      setTeamName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-team-name">新增团队名称</Label>
          <Input
            id="new-team-name"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="例如：上海一部"
            className="h-10 rounded-xl bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
          />
        </div>
        <Button
          onClick={handleCreate}
          disabled={isPending || !teamName.trim()}
          className="h-10 bg-zinc-900 text-white rounded-[10px] hover:bg-zinc-800 hover:-translate-y-[1px] active:translate-y-0"
        >
          {isPending ? "创建中..." : "新增团队"}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-zinc-800">当前团队</p>
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <Badge
              key={team.id}
              variant="outline"
              className="rounded-[10px] px-3 py-1"
            >
              {team.name}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
