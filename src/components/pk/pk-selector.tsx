"use client"

import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type PKSelectorMode = "1v1" | "vsTeam"

type PKSelectorMember = {
  id: string
  name: string
  label?: string
}

export type PKSelectorProps = {
  members: PKSelectorMember[]
  defaultOpponent?: string
  mode: PKSelectorMode
  onModeChange: (mode: PKSelectorMode) => void
  selectedOpponentId?: string | null
  onOpponentChange: (id: string | null) => void
  className?: string
}

export function PKSelector({
  members,
  defaultOpponent,
  mode,
  onModeChange,
  selectedOpponentId,
  onOpponentChange,
  className,
}: PKSelectorProps) {
  const fallbackOpponent = defaultOpponent ?? members[0]?.id ?? null
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (hasInitializedRef.current) {
      return
    }

    if (selectedOpponentId === undefined && fallbackOpponent) {
      onOpponentChange(fallbackOpponent)
    }

    hasInitializedRef.current = true
  }, [fallbackOpponent, onOpponentChange, selectedOpponentId])

  const currentOpponentId = selectedOpponentId ?? fallbackOpponent

  return (
    <div
      className={cn(
        "card-elevated rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.9))] p-4 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.22)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.62))]",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">对战模式</div>
          <p className="text-xs text-muted-foreground">在个人对个人与团队均值之间快速切换。</p>
        </div>

        <div className="inline-flex rounded-full border border-white/80 bg-white/75 p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/10">
          <Button
            type="button"
            size="sm"
            variant={mode === "1v1" ? "default" : "ghost"}
            className="rounded-full px-3"
            onClick={() => onModeChange("1v1")}
          >
            vs 某人
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "vsTeam" ? "default" : "ghost"}
            className="rounded-full px-3"
            onClick={() => onModeChange("vsTeam")}
          >
            vs 团队平均
          </Button>
        </div>
      </div>

      <div className={cn("mt-4", mode === "vsTeam" && "hidden sm:block")}>
        <div
          className={cn(
            "rounded-2xl border border-white/70 bg-white/75 p-3 backdrop-blur dark:border-white/10 dark:bg-white/5",
            mode === "vsTeam" && "hidden"
          )}
        >
          <div className="mb-2 text-xs font-medium text-muted-foreground">选择对手</div>
          <Select
            value={currentOpponentId ?? undefined}
            onValueChange={(value) => onOpponentChange(value || null)}
            disabled={mode !== "1v1" || members.length === 0}
          >
            <SelectTrigger className="w-full rounded-xl border-white/70 bg-background/80 px-3 dark:border-white/10 dark:bg-white/10">
              <SelectValue placeholder="选择一个对手" />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate">{member.name}</span>
                    {member.label ? (
                      <span className="truncate text-xs text-muted-foreground">{member.label}</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
