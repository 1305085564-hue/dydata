/**
 * 百度 OCR 识别通道：百度提字 → 文字模型结构化字段映射。
 * 输出契约与旧视觉通道完全等价（复用 ocr-contract 解析）。
 */

import { callAi } from "@/lib/ai/client";
import {
  BaiduOcrError,
  recognizeWebImage,
} from "@/lib/baidu-ocr";
import {
  buildNoTextFailedResponse,
  parseOcrResponse,
} from "./ocr-contract";
import type { OcrErrorCode, ParsedScreenshotResponse, ScreenshotType } from "./ocr-contract";

export type OcrTimingsLike = {
  baidu_ms?: number;
  structure_ms?: number;
};

export type BaiduOcrAttemptInput = {
  dataUrl: string;
  screenshotType: ScreenshotType;
  timings: Partial<OcrTimingsLike> & Record<string, unknown>;
};

export type BaiduOcrAttemptResult = {
  parsed: ParsedScreenshotResponse | null;
  channelName: "baidu";
  model: string | null;
};

export type StructureModelCaller = (prompt: string) => Promise<{ content: string; model?: string }>;

/** 结构化调用绑定独立功能键，与看图回退（ocr_screenshot）的模型绑定互不干扰 */
export const STRUCTURE_FEATURE_KEY = "ocr_screenshot_structure";

/** 百度错误分类 → 现有 OcrErrorCode 枚举；非 BaiduOcrError 返回 null 交给调用方兜底 */
export function mapBaiduErrorToOcrCode(error: unknown): OcrErrorCode | null {
  if (!(error instanceof BaiduOcrError)) {
    return null;
  }
  switch (error.errorType) {
    case "QPS_LIMITED":
      return "RATE_LIMITED";
    case "TIMEOUT":
      return "AI_TIMEOUT";
    case "IMAGE_REJECTED":
      return "LOW_CONFIDENCE";
    // CONFIG / TOKEN_INVALID / QUOTA_EXCEEDED / SERVICE_ERROR 都按通道不可用告警
    default:
      return "AI_CHANNEL_UNAVAILABLE";
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Buffer.from(base64, "base64");
}

async function callStructureModelViaAi(prompt: string): Promise<{ content: string; model?: string }> {
  const aiResult = await callAi({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 500,
    jsonMode: true,
    timeoutMs: 20000,
    featureKey: STRUCTURE_FEATURE_KEY,
    databaseOnly: true,
  });
  return { content: aiResult.content, model: aiResult.model };
}

/**
 * 百度通道识别：提字（baidu_ms）→ 文字模型结构化（structure_ms）。
 * deps 仅测试注入用，生产走真实实现。
 */
export async function runBaiduOcrAttempt(
  input: BaiduOcrAttemptInput,
  deps: {
    recognize?: typeof recognizeWebImage;
    callStructureModel?: StructureModelCaller;
  } = {},
): Promise<BaiduOcrAttemptResult> {
  const recognize = deps.recognize ?? recognizeWebImage;
  const callStructureModel = deps.callStructureModel ?? callStructureModelViaAi;

  const imageBuffer = dataUrlToBuffer(input.dataUrl);

  const baiduStart = Date.now();
  const lines = await recognize(imageBuffer);
  input.timings.baidu_ms = (input.timings.baidu_ms ?? 0) + Date.now() - baiduStart;

  if (lines.length === 0) {
    return {
      parsed: buildNoTextFailedResponse(input.screenshotType),
      channelName: "baidu",
      model: null,
    };
  }

  const prompt = buildStructurePromptByType(input.screenshotType, lines);

  const structureStart = Date.now();
  const structure = await callStructureModel(prompt);
  input.timings.structure_ms = (input.timings.structure_ms ?? 0) + Date.now() - structureStart;

  const parsed = parseOcrResponse(structure.content, input.screenshotType);
  return { parsed, channelName: "baidu", model: structure.model ?? null };
}

export function buildStructurePromptByType(type: ScreenshotType, lines: string[]): string {
  const lineBlock = lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  if (type === "retention") {
    return buildRetentionStructurePrompt(lineBlock);
  }
  return buildDataStructurePrompt(lineBlock);
}

function buildDataStructurePrompt(lineBlock: string): string {
  return [
    "你是抖音数据截图结构化助手。以下是 OCR 从截图中按原始顺序识别出的文字行：",
    lineBlock,
    "",
    "请从文字行中提取 6 个核心指标，并严格只返回 JSON。",
    "要求：",
    "1. 字段固定为 play_count、likes、comments、shares、favorites、follower_gain、confidence。",
    "2. play_count 返回真实播放量数字，例如文字行是 3.21万 时换算为 32100。",
    "3. likes、comments、shares、favorites、follower_gain 返回整数。",
    "4. 文字行中找不到的字段返回 null，禁止编造。",
    "5. confidence 必须包含以上 6 个字段，值只能是 high、medium、low：文字行明确可对应时 high，需要换算或含义模糊时 medium，找不到时 low。",
    "6. 只返回 JSON，不要 markdown，不要解释。",
  ].join("\n");
}

function buildRetentionStructurePrompt(lineBlock: string): string {
  return [
    "你是抖音留存截图结构化助手。以下是 OCR 从截图中按原始顺序识别出的文字行：",
    lineBlock,
    "",
    "请识别完播留存核心数值，并严格返回 JSON。",
    "字段固定为 recognized、retention_metrics、confidence。",
    "retention_metrics 必须包含 avg_play_duration、bounce_rate_2s、completion_rate_5s、completion_rate。",
    "avg_play_duration 返回秒数纯数字，不要带‘秒’。",
    "bounce_rate_2s、completion_rate_5s、completion_rate 返回百分比纯数字，不要带‘%’。",
    "无法确定的字段返回 null，禁止编造。",
    "完全无法识别时返回 { recognized:false, reason:'...' }。",
    "confidence 返回 0 到 1 的数字。",
    "只返回 JSON，不要解释。",
  ].join("\n");
}
