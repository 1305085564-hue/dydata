import { NextRequest, NextResponse } from "next/server"

import { callAiJson, extractJsonString } from "@/lib/ai/client"
import { buildGrowthAdvicePromptAsync } from "@/lib/ai/growth-prompts"
import { createClient } from "@/lib/supabase/server"

type GrowthAdviceRequestBody = {
  userId: string
  accountId: string
  summary7d: unknown
  diagnostics: unknown
  weakestDimensions: unknown
  benchmark: unknown
  benchmarkSamples: unknown
}

type GrowthAdviceResponse = {
  diagnosis: string
  reference: string
  action: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function hasRequiredPayloadFields(body: unknown): body is GrowthAdviceRequestBody {
  if (!isRecord(body)) return false

  return (
    isNonEmptyString(body.userId) &&
    isNonEmptyString(body.accountId) &&
    "summary7d" in body &&
    "diagnostics" in body &&
    "weakestDimensions" in body &&
    "benchmark" in body &&
    "benchmarkSamples" in body
  )
}

function parseAdvice(content: string): GrowthAdviceResponse | null {
  const jsonString = extractJsonString(content)
  if (!jsonString) return null

  try {
    const parsed = JSON.parse(jsonString) as Partial<GrowthAdviceResponse>

    if (
      isNonEmptyString(parsed.diagnosis) &&
      isNonEmptyString(parsed.reference) &&
      isNonEmptyString(parsed.action)
    ) {
      return {
        diagnosis: parsed.diagnosis.trim(),
        reference: parsed.reference.trim(),
        action: parsed.action.trim(),
      }
    }
  } catch {
    return null
  }

  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 })
  }

  if (!hasRequiredPayloadFields(body)) {
    return NextResponse.json(
      {
        error:
          "缺少必要字段：userId、accountId、summary7d、diagnostics、weakestDimensions、benchmark、benchmarkSamples",
      },
      { status: 400 }
    )
  }

  // 防越权：忽略前端传的 userId，强制用服务端认证的 user.id
  body.userId = user.id

  const prompt = await buildGrowthAdvicePromptAsync(body)

  try {
    const result = await callAiJson(prompt, { maxTokens: 1200, featureKey: "growth_advice" })
    const advice = parseAdvice(result.content)

    if (!advice) {
      return NextResponse.json({ error: "AI 返回内容解析失败" }, { status: 500 })
    }

    return NextResponse.json(advice)
  } catch (error) {
    console.error("[growth-advice] AI 请求异常", error);
    return NextResponse.json(
      { error: "AI 建议生成失败，请稍后重试" },
      { status: 500 }
    )
  }
}
