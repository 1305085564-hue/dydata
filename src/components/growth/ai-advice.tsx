"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type GrowthAdvicePayload = {
  summary7d: unknown
  diagnostics: unknown
  weakestDimensions: unknown
  benchmark: unknown
  benchmarkSamples: unknown
}

type GrowthAdviceData = {
  diagnosis: string
  reference: string
  action: string
}

type ReferenceClickPayload = {
  personName?: string
  videoTitle?: string
  reference: string
}

type AiAdviceProps = {
  userId: string
  accountId: string
  payload: GrowthAdvicePayload
  onReferenceClick?: (payload: ReferenceClickPayload) => void
  className?: string
}

type RequestState =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: GrowthAdviceData; error: null }
  | { status: "error"; data: null; error: string }

const 初始状态: RequestState = {
  status: "loading",
  data: null,
  error: null,
}

const 卡片配置 = [
  {
    key: "diagnosis",
    title: "🔍 诊断",
    toneClassName:
      "border-orange-200/80 bg-orange-50/80 dark:border-orange-400/20 dark:bg-orange-400/10",
  },
  {
    key: "reference",
    title: "📖 参考",
    toneClassName:
      "border-sky-200/80 bg-sky-50/80 dark:border-sky-400/20 dark:bg-sky-400/10",
  },
  {
    key: "action",
    title: "🎯 动作",
    toneClassName:
      "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-400/10",
  },
] as const satisfies ReadonlyArray<{
  key: keyof GrowthAdviceData
  title: string
  toneClassName: string
}>

function 提取参考信息(reference: string) {
  const titleMatch = reference.match(/《([^》]+)》/)
  const videoTitle = titleMatch?.[1]?.trim()
  const personMatch = reference.match(/^\s*([^《\s，。；：:]+)\s*《[^》]+》/)
  const personName = personMatch?.[1]?.trim()

  return { personName, videoTitle }
}

function 骨架卡片() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((item) => (
        <Card
          key={item}
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
        >
          <CardHeader className="space-y-3 border-b border-border/70 pb-4">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function AiAdvice({ userId, accountId, payload, onReferenceClick, className }: AiAdviceProps) {
  const [state, setState] = useState<RequestState>(初始状态)

  const requestBody = useMemo(
    () => ({
      userId,
      accountId,
      ...payload,
    }),
    [accountId, payload, userId]
  )

  useEffect(() => {
    let cancelled = false

    async function loadAdvice() {
      setState({ status: "loading", data: null, error: null })

      try {
        const res = await fetch("/api/growth-advice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        const data = (await res.json()) as Partial<GrowthAdviceData> & { error?: string }

        if (cancelled) return

        if (!res.ok) {
          setState({ status: "error", data: null, error: data.error || "请求失败" })
          return
        }

        if (
          typeof data.diagnosis !== "string" ||
          typeof data.reference !== "string" ||
          typeof data.action !== "string"
        ) {
          setState({ status: "error", data: null, error: "AI 返回格式不正确" })
          return
        }

        setState({
          status: "success",
          data: {
            diagnosis: data.diagnosis,
            reference: data.reference,
            action: data.action,
          },
          error: null,
        })
      } catch {
        if (!cancelled) {
          setState({ status: "error", data: null, error: "网络错误，请稍后重试" })
        }
      }
    }

    void loadAdvice()

    return () => {
      cancelled = true
    }
  }, [requestBody])

  const referenceMeta = useMemo(() => {
    return state.status === "success" ? 提取参考信息(state.data.reference) : null
  }, [state])

  return (
    <div className={cn("space-y-4", className)}>
      {state.status === "loading" && !state.data ? <骨架卡片 /> : null}

      {state.status === "error" ? (
        <Card className="rounded-xl border border-destructive/20 bg-destructive/5 shadow-[0_12px_30px_-24px_rgba(220,38,38,0.45)]">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="text-sm font-medium text-destructive">AI 建议生成失败</div>
            <p className="text-sm leading-6 text-muted-foreground">{state.error}</p>
          </CardContent>
        </Card>
      ) : null}

      {state.status === "success" ? (
        <div className="space-y-4">
          {卡片配置.map((section) => {
            const content = state.data[section.key]
            const isReference = section.key === "reference"

            return (
              <Card
                key={section.key}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
              >
                <CardHeader className="border-b border-border/70 pb-4">
                  <CardTitle className="text-[15px] font-semibold text-foreground sm:text-base">
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div
                    className={cn(
                      "rounded-xl border px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                      section.toneClassName
                    )}
                  >
                    {isReference ? (
                      <div className="space-y-3">
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                          {content}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto rounded-full px-0 text-sm font-medium text-foreground hover:bg-transparent hover:opacity-70"
                          onClick={() =>
                            onReferenceClick?.({
                              personName: referenceMeta?.personName,
                              videoTitle: referenceMeta?.videoTitle,
                              reference: content,
                            })
                          }
                        >
                          {referenceMeta?.personName && referenceMeta?.videoTitle
                            ? `查看参考：${referenceMeta.personName}《${referenceMeta.videoTitle}》`
                            : "查看参考详情"}
                        </Button>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                        {content}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
