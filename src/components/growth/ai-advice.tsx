"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
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
    title: "诊断",
    toneClassName:
      "border-zinc-200 border-l-[1.5px] border-l-[#D99E55]",
  },
  {
    key: "reference",
    title: "参考",
    toneClassName:
      "border-zinc-200 border-l-[1.5px] border-l-[#8AA8C7]",
  },
  {
    key: "action",
    title: "动作",
    toneClassName:
      "border-zinc-200 border-l-[1.5px] border-l-[#6FAA7D]",
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
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
        >
          <CardHeader className="space-y-3 border-b border-zinc-200 pb-4">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
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
        <ErrorState title="AI 建议生成失败" description={state.error} />
      ) : null}

      {state.status === "success" ? (
        <div className="space-y-4">
          {卡片配置.map((section) => {
            const content = state.data[section.key]
            const isReference = section.key === "reference"

            return (
              <Card
                key={section.key}
                className="overflow-hidden rounded-2xl bg-white"
              >
                <CardHeader className="border-b border-zinc-200 pb-4">
                  <CardTitle className="text-[13px] font-semibold text-zinc-800">
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div
                    className={cn(
                      "rounded-xl border px-4 py-3",
                      section.toneClassName
                    )}
                  >
                    {isReference ? (
                      <div className="space-y-3">
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-zinc-800">
                          {content}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-[13px] font-medium text-zinc-800 hover:bg-transparent hover:opacity-70"
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
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-zinc-800">
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
