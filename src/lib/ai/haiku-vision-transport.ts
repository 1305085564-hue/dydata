import type { AiRequestOptions } from "./client";

/** api1's Haiku 5.5 compatibility endpoint drops images; use its verified native format. */
export function usesHaikuNativeVision(model: string, options: AiRequestOptions) {
  return /^claude-haiku-5[-.]5$/i.test(model) && options.messages.some(message =>
    Array.isArray(message.content) && message.content.some(block => block.type === "image_url"));
}

export function buildHaikuVisionBody(model: string, options: AiRequestOptions) {
  const system = options.messages.filter(message => message.role === "system")
    .map(message => typeof message.content === "string" ? message.content : message.content.filter(block => block.type === "text").map(block => block.text).join("\n"));
  if (options.jsonMode) system.push("Return only a valid JSON object, without Markdown fences.");
  return {
    model, max_tokens: options.maxTokens ?? 2000, stream: false,
    ...(system.length ? { system: system.join("\n") } : {}),
    messages: options.messages.filter(message => message.role !== "system").map(message => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : message.content.map(block => {
        if (block.type === "text") return block;
        const image = block.image_url.url.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]+)$/);
        return { type: "image", source: image
          ? { type: "base64", media_type: image[1], data: image[2] }
          : { type: "url", url: block.image_url.url } };
      }),
    })),
  };
}

export async function parseHaikuVisionResponse(response: Response, options: AiRequestOptions) {
  const body = await response.json() as {
    model?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  // Thinking blocks never stand in for the answer or leak into downstream JSON parsing.
  const content = (body.content ?? []).filter(block => block.type === "text").map(block => block.text ?? "").join("");
  if (content) options.onChunk?.(content);
  const input = body.usage?.input_tokens ?? null;
  const output = body.usage?.output_tokens ?? null;
  return {
    content, reasoningContent: "", model: body.model ?? null,
    usage: { promptTokens: input, completionTokens: output, totalTokens: input !== null && output !== null ? input + output : null },
    rawSnippet: content.slice(0, 200), diagnosticBody: {},
  };
}
