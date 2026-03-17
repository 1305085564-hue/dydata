import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ConfidenceLevel = "high" | "medium" | "low";

type OcrFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain";

type ParsedOcrResult = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  confidence: Record<OcrFieldKey, ConfidenceLevel>;
};

type OpenAICompatibleMessageContentBlock = {
  type?: string;
  text?: string;
};

type UpstreamRequestBody = {
  model: string;
  messages: Array<{
    role: "user";
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  }>;
  max_tokens: number;
  response_format: { type: "json_object" };
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OCR_MODEL = process.env.OCR_MODEL || "claude-haiku-4-5";
const OCR_FIELDS: OcrFieldKey[] = [
  "play_count",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_gain",
];

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "截图识别功能暂不可用，请手动输入数据" },
      { status: 500 }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const imagePayload = contentType.includes("multipart/form-data")
      ? await parseMultipartPayload(request)
      : await parseJsonPayload(request);

    if (imagePayload.error || !imagePayload.dataUrl) {
      return NextResponse.json({ error: imagePayload.error || "图片为空、损坏或请求格式不正确" }, { status: 400 });
    }

    const dataUrl = imagePayload.dataUrl;
    const upstreamUrl = buildUpstreamUrl(baseUrl);
    const requestBody: UpstreamRequestBody = {
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt(),
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" as const },
    };

    console.log(
      "[ocr-screenshot] upstream request",
      JSON.stringify({
        url: upstreamUrl,
        body: serializeRequestBodyForLog(requestBody),
      })
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const aiRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const rawText = await aiRes.text();

      console.log(
        "[ocr-screenshot] upstream response",
        JSON.stringify({
          status: aiRes.status,
          ok: aiRes.ok,
          body: rawText,
        })
      );

      if (!aiRes.ok) {
        return NextResponse.json(
          { error: extractUpstreamError(rawText) || "截图识别失败，请稍后重试或手动输入数据" },
          { status: 500 }
        );
      }

      const aiData = safeJsonParse(rawText);
      const content = aiData?.choices?.[0]?.message?.content;
      const parsed = parseOcrContent(content);

      if (!parsed) {
        return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
      }

      const hasAnyValue = OCR_FIELDS.some((field) => parsed[field] !== null);
      if (!hasAnyValue) {
        return NextResponse.json({ error: "图片不清晰或未识别到数据" }, { status: 500 });
      }

      return NextResponse.json({ data: parsed });
    } catch (error) {
      console.error("[ocr-screenshot] request failed", error);

      if ((error as Error).name === "AbortError") {
        return NextResponse.json({ error: "AI 识别超时，请稍后重试" }, { status: 504 });
      }

      return NextResponse.json(
        { error: (error as Error).message || "截图识别出错，请稍后重试或手动输入" },
        { status: 500 }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ error: "图片为空、损坏或请求格式不正确" }, { status: 400 });
  }
}

async function parseMultipartPayload(
  request: NextRequest
): Promise<{ dataUrl: string; error?: undefined } | { dataUrl?: undefined; error: string }> {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "请上传图片文件" };
  }

  return fileToDataUrl(file);
}

async function parseJsonPayload(
  request: NextRequest
): Promise<{ dataUrl: string; error?: undefined } | { dataUrl?: undefined; error: string }> {
  const body = await request.json();
  const image = typeof body?.image === "string" ? body.image.trim() : "";

  if (!image) {
    return { error: "图片为空、损坏或请求格式不正确" };
  }

  if (image.startsWith("data:image/")) {
    const mimeType = image.slice(5, image.indexOf(";"));
    if (!ACCEPTED_TYPES.has(mimeType)) {
      return { error: "仅支持 jpg、png、webp 图片" };
    }
    return { dataUrl: image };
  }

  return { error: "JSON 请求需提供 data URL 格式图片" };
}

async function fileToDataUrl(
  file: File
): Promise<{ dataUrl: string; error?: undefined } | { dataUrl?: undefined; error: string }> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return { error: "仅支持 jpg、png、webp 图片" };
  }

  if (file.size <= 0) {
    return { error: "图片为空或已损坏，请重新上传" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { error: "图片不能超过 8MB" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    dataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
  };
}

function buildPrompt(): string {
  return [
    "你是抖音数据截图 OCR 助手。",
    "请识别截图中的 6 个核心指标，并严格只返回 JSON。",
    "要求：",
    "1. 字段固定为 play_count、likes、comments、shares、favorites、follower_gain、confidence。",
    "2. play_count 返回以‘万’为单位的小数，例如 3.21；如果截图写的是 32100，请换算为 3.21。",
    "3. likes、comments、shares、favorites、follower_gain 返回整数。",
    "4. 无法确定时返回 null。",
    "5. confidence 必须包含以上 6 个字段，值只能是 high、medium、low。",
    "6. 只返回 JSON，不要 markdown，不要解释。",
    "返回示例：",
    JSON.stringify({
      play_count: 3.21,
      likes: 1280,
      comments: 68,
      shares: 15,
      favorites: 106,
      follower_gain: 42,
      confidence: {
        play_count: "high",
        likes: "high",
        comments: "medium",
        shares: "medium",
        favorites: "low",
        follower_gain: "medium",
      },
    }),
  ].join("\n");
}

function buildUpstreamUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function serializeRequestBodyForLog(body: UpstreamRequestBody) {
  return {
    ...body,
    messages: body.messages.map((message) => ({
      ...message,
      content: message.content.map((item) => {
        if (item.type !== "image_url") {
          return item;
        }

        return {
          type: item.type,
          image_url: {
            url_preview: item.image_url.url.slice(0, 120),
            url_length: item.image_url.url.length,
          },
        };
      }),
    })),
  };
}

function extractUpstreamError(rawText: string): string | null {
  const parsed = safeJsonParse(rawText);
  const message = parsed?.error?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

function safeJsonParse(rawText: string): any {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function parseOcrContent(content: unknown): ParsedOcrResult | null {
  const normalizedContent = normalizeMessageContent(content);
  if (!normalizedContent) {
    return null;
  }

  const jsonText = extractJson(normalizedContent);
  if (!jsonText) {
    return null;
  }

  try {
    const raw = JSON.parse(jsonText) as Partial<ParsedOcrResult> & {
      confidence?: Partial<Record<OcrFieldKey, ConfidenceLevel>>;
    };

    const normalized: ParsedOcrResult = {
      play_count: normalizeNumber(raw.play_count, true),
      likes: normalizeNumber(raw.likes),
      comments: normalizeNumber(raw.comments),
      shares: normalizeNumber(raw.shares),
      favorites: normalizeNumber(raw.favorites),
      follower_gain: normalizeNumber(raw.follower_gain),
      confidence: {
        play_count: normalizeConfidence(raw.confidence?.play_count),
        likes: normalizeConfidence(raw.confidence?.likes),
        comments: normalizeConfidence(raw.confidence?.comments),
        shares: normalizeConfidence(raw.confidence?.shares),
        favorites: normalizeConfidence(raw.confidence?.favorites),
        follower_gain: normalizeConfidence(raw.confidence?.follower_gain),
      },
    };

    return normalized;
  } catch {
    return null;
  }
}

function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = (content as OpenAICompatibleMessageContentBlock[])
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text?.trim() || "")
      .filter(Boolean)
      .join("\n");

    return text || null;
  }

  return null;
}

function extractJson(content: string): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return content.slice(start, end + 1);
}

function normalizeNumber(value: unknown, allowDecimal = false): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? allowDecimal
        ? Math.round(value * 100) / 100
        : Math.round(value)
      : null;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[,%\s]/g, "").replace(/万$/, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return allowDecimal ? Math.round(parsed * 100) / 100 : Math.round(parsed);
  }

  return null;
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
}
