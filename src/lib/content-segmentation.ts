export const SEGMENT_TYPES = [
  "封面标题",
  "开头钩子",
  "背景铺垫",
  "核心观点",
  "展开论证",
  "操作建议",
  "CTA",
] as const;

export type SegmentType = (typeof SEGMENT_TYPES)[number];

export type ContentSegment = {
  type: SegmentType;
  text: string;
  startIndex: number;
  endIndex: number;
};

export type RawContentParagraph = {
  text: string;
  startIndex: number;
  endIndex: number;
};

const SEGMENT_MARKERS = [
  /^标题[:：]/,
  /^封面[:：]/,
  /^先说结论[:：]?/,
  /^结论先说[:：]?/,
  /^开头[:：]/,
  /^为什么/,
  /^背景/,
  /^先看背景/,
  /^核心观点[:：]?/,
  /^我的观点[:：]?/,
  /^重点[:：]?/,
  /^具体看/,
  /^展开说/,
  /^原因有/,
  /^第一[，、:：]/,
  /^操作上/,
  /^建议/,
  /^如果你/,
  /^最后/,
  /^记得/,
  /^关注我/,
  /^点个关注/,
];

function normalizeContent(content: string) {
  return content.replace(/\r\n/g, "\n").trim();
}

function isLikelyMarker(sentence: string) {
  return SEGMENT_MARKERS.some((pattern) => pattern.test(sentence.trim()));
}

function splitSentences(content: string) {
  const result: string[] = [];
  const markerRegex = /(标题[:：][^。！？!?\n]*)(?=\s+(?:先说结论|结论先说|开头|为什么|背景|先看背景|核心观点|我的观点|重点|具体看|展开说|原因有|第一|操作上|建议|如果你|最后|记得|关注我|点个关注))/g;
  const contentWithHardBreaks = content.replace(markerRegex, "$1\n");
  let current = "";

  for (const char of contentWithHardBreaks) {
    current += char;
    if (/[。！？!?\n]/.test(char)) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = "";
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

export function splitContentIntoBusinessParagraphs(content: string): RawContentParagraph[] {
  const normalized = normalizeContent(content);
  if (!normalized) return [];

  const sentences = splitSentences(normalized);
  const paragraphs: RawContentParagraph[] = [];
  let cursor = 0;
  let currentText = "";
  let currentStartIndex = 0;

  for (const sentence of sentences) {
    const startIndex = normalized.indexOf(sentence, cursor);
    const endIndex = startIndex + sentence.length - 1;
    const shouldStartNew = currentText && isLikelyMarker(sentence);

    if (!currentText) {
      currentText = sentence;
      currentStartIndex = startIndex;
    } else if (shouldStartNew) {
      paragraphs.push({
        text: currentText,
        startIndex: currentStartIndex,
        endIndex: currentStartIndex + currentText.length - 1,
      });
      currentText = sentence;
      currentStartIndex = startIndex;
    } else {
      currentText += sentence;
    }

    cursor = endIndex + 1;
  }

  if (currentText) {
    paragraphs.push({
      text: currentText,
      startIndex: currentStartIndex,
      endIndex: currentStartIndex + currentText.length - 1,
    });
  }

  return paragraphs;
}

export function buildSegmentationPrompt(paragraphs: RawContentParagraph[]) {
  return [
    "你是短视频文案结构分析助手。",
    "目标：按业务结构识别每一段的归属，不能只按自然段理解。",
    "只能从给定段落类型中选择：封面标题、开头钩子、背景铺垫、核心观点、展开论证、操作建议、CTA。",
    "严格输出 JSON，不要 markdown，不要额外解释。",
    '输出格式固定为 {"segments":[{"type":"封面标题","text":"...","startIndex":0,"endIndex":10}]}。',
    "每段必须保留原文 text，并原样返回 startIndex、endIndex。",
    "如果存在标题句，优先识别为封面标题；如果有引导关注/评论/私信/看主页，优先识别为 CTA。",
    "待分类段落：",
    JSON.stringify(paragraphs, null, 2),
  ].join("\n");
}

function isSegmentType(value: unknown): value is SegmentType {
  return typeof value === "string" && SEGMENT_TYPES.includes(value as SegmentType);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseSegmentClassification(content: string): ContentSegment[] {
  try {
    const parsed = JSON.parse(content) as { segments?: unknown[] };
    if (!Array.isArray(parsed.segments)) {
      return [];
    }

    return parsed.segments
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        if (!isSegmentType(record.type) || !isNonEmptyText(record.text)) return null;
        if (typeof record.startIndex !== "number" || typeof record.endIndex !== "number") return null;

        return {
          type: record.type,
          text: record.text.trim(),
          startIndex: record.startIndex,
          endIndex: record.endIndex,
        } satisfies ContentSegment;
      })
      .filter((item): item is ContentSegment => Boolean(item));
  } catch {
    return [];
  }
}

function buildUpstreamUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const block = item as { type?: unknown; text?: unknown };
      return block.type === "text" && typeof block.text === "string" ? block.text.trim() : "";
    })
    .filter(Boolean)
    .join("\n");

  return text || null;
}

function extractJsonString(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

export async function classifyContentSegmentsWithAi(paragraphs: RawContentParagraph[]) {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "claude-sonnet-4-6";

  if (!baseUrl || !apiKey || !paragraphs.length) {
    return [];
  }

  const response = await fetch(buildUpstreamUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildSegmentationPrompt(paragraphs) }],
      max_tokens: 1600,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI 请求失败: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const rawContent = normalizeMessageContent(data.choices?.[0]?.message?.content);
  const jsonString = rawContent ? extractJsonString(rawContent) : null;

  return jsonString ? parseSegmentClassification(jsonString) : [];
}
