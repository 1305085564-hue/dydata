import { NextRequest, NextResponse } from "next/server"

import { callAiJson, extractJsonString } from "@/lib/ai/client"
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

function buildPrompt({ userId, accountId, ...payload }: GrowthAdviceRequestBody) {
  return [
    "你是抖音增长教练，不是客服。",
    "说话直接、短句、基于证据，不要安慰，不要鸡汤，不要正确的废话。",
    "禁止输出没有证据支撑的建议，禁止复述题目。",
    "",
    "任务：根据用户近 7 天表现、5 维诊断分位、最弱维度、标杆和样本，输出 3 段行动建议。",
    "",
    "硬性要求：",
    "1. 只输出 JSON 对象，不要 Markdown，不要代码块，不要额外说明。",
    '2. JSON 格式固定为 {"diagnosis":"...","reference":"...","action":"..."}。',
    '3. diagnosis 必须引用具体数据，至少点出 2 个指标或分位证据。',
    '4. reference 必须包含可识别的人名和视频标题，优先使用“人名《视频标题》”格式，并说明为什么值得参考。',
    '5. action 必须落到具体执行动作，至少覆盖以下中的 2 项：开头、结构、选题、发布时间、表达方式、镜头/节奏。',
    "6. 三段都要短、狠、可执行，避免套话。",
    "",
    `用户 ID：${userId}`,
    `账号 ID：${accountId}`,
    "",
    "分析输入 JSON：",
    JSON.stringify(payload, null, 2),
  ].join("\n")
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

  const prompt = buildPrompt(body)

  try {
    const result = await callAiJson(prompt, { maxTokens: 1200 })
    const advice = parseAdvice(result.content)

    if (!advice) {
      return NextResponse.json({ error: "AI 返回内容解析失败" }, { status: 500 })
    }

    return NextResponse.json(advice)
  } catch (error) {
    return NextResponse.json(
      { error: `AI 请求异常: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
