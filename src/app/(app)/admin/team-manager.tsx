"use client";

import { Badge } from "@/components/ui/badge";

interface Team {
  id: string;
  name: string;
}

interface TeamManagerProps {
  teams: Team[];
}

export function TeamManager({ teams }: TeamManagerProps) {
  return (
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
  );
}
