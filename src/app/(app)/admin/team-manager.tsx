"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [localTeams, setLocalTeams] = useState(teams);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalTeams(teams);
  }, [teams]);

  function handleCreate() {
    const normalizedName = teamName.trim();
    if (!normalizedName) return;
    const optimisticTeam = { id: `pending-${Date.now()}`, name: normalizedName };

    setLocalTeams((current) => [...current, optimisticTeam]);
    setTeamName("");
    feedbackToast.success(`已新增团队：${normalizedName}`);

    startTransition(async () => {
      const result = await createTeam(normalizedName);
      if (result.error) {
        setLocalTeams((current) => current.filter((team) => team.id !== optimisticTeam.id));
        setTeamName(normalizedName);
        feedbackToast.error(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-zinc-800">当前团队</p>
      <div className="flex flex-wrap gap-2">
        {localTeams.map((team) => (
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
  );
}
