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
        "rounded-2xl border border-stone-200 bg-white p-4 shadow-sm",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">对战模式</div>
          <p className="text-xs text-muted-foreground">在个人对个人与团队均值之间快速切换。</p>
        </div>

        <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
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
            "rounded-2xl border border-stone-200 bg-stone-50 p-3",
            mode === "vsTeam" && "hidden"
          )}
        >
          <div className="mb-2 text-xs font-medium text-muted-foreground">选择对手</div>
          <Select
            value={currentOpponentId ?? undefined}
            onValueChange={(value) => onOpponentChange(value || null)}
            disabled={mode !== "1v1" || members.length === 0}
            items={members.map((member) => ({
              value: member.id,
              label: member.label ? `${member.name} · ${member.label}` : member.name,
            }))}
          >
            <SelectTrigger className="w-full rounded-xl border-stone-200 bg-white px-3">
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
