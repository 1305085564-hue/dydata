export function normalizeContentKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, 3);
}

export function validateVideoSubmitPayload(body: {
  account_id?: string;
  video_title?: string | null;
  content?: string | null;
  content_keywords?: unknown;
}) {
  if (!body.account_id) {
    return { ok: false as const, error: "account_id 为必填项" };
  }

  const title = typeof body.video_title === "string" ? body.video_title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const keywords = normalizeContentKeywords(body.content_keywords);

  if (!title || !content || keywords.length === 0) {
    return { ok: false as const, error: "标题、文案、内容标签为必填项" };
  }

  return { ok: true as const, contentKeywords: keywords };
}
